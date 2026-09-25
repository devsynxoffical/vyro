import {
  FaceLandmarker,
  HandLandmarker,
  PoseLandmarker,
  FilesetResolver,
  type Landmark,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { PRODUCTS, type Product } from '../types';
import { estimateFingerSize } from './fingerSizing';
import { SmoothAngle, SmoothPoint, SmoothValue } from './smoothing';
import {
  DEFAULT_ALPHA_BOUNDS,
  DEFAULT_WATCH_GEOMETRY,
  measureAlphaBounds,
  measureWatchGeometry,
  type AlphaBounds,
  type WatchGeometry,
} from './watchGeometry';

type Vision = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
type Pt = { x: number; y: number };

const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// Pose landmark indices
const POSE = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
} as const;
const POSE_MIN_VISIBILITY = 0.5;
/** Elbows at the frame edge get hallucinated positions; demand more of them. */
const POSE_ELBOW_MIN_VISIBILITY = 0.65;

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';
export type CameraFacing = 'user' | 'environment';

export interface EngineInitOptions {
  facingMode?: CameraFacing;
}

export interface EngineCallbacks {
  onStatus: (status: EngineStatus, message?: string) => void;
  onFps?: (fps: number) => void;
  onTracking?: (tracking: boolean) => void;
}

export interface EngineElements {
  videoElement: HTMLVideoElement;
  overlayCanvas: HTMLCanvasElement;
}

export interface LoadedImage {
  image: HTMLImageElement;
  aspect: number;
}

const RING_TUNING: Record<string, { bandRatio: number; anchorY: number }> = {
  'ring-1': { bandRatio: 0.56, anchorY: 0.54 },
  'ring-2': { bandRatio: 0.73, anchorY: 0.56 },
  'ring-3': { bandRatio: 0.7, anchorY: 0.53 },
};

const DEFAULT_RING_TUNING = { bandRatio: 0.62, anchorY: 0.54 };
/** Outer width of a ring band on a ring finger, in metres (finger + band) */
const RING_OUTER_METERS = 0.021;

const GLASSES_TUNING: Record<
  string,
  { widthFactor: number; anchorX: number; anchorY: number }
> = {
  'glasses-1': { widthFactor: 1.0, anchorX: 0.5, anchorY: 0.405 },
};

const DEFAULT_GLASSES_TUNING = { widthFactor: 1.0, anchorX: 0.5, anchorY: 0.405 };

/**
 * Detection drops out for a frame or two on fast moves or in low light. Keep
 * the last overlay up briefly rather than blinking, and only restart the
 * smoothing after a real loss.
 */
const HOLD_FRAMES = 8;
const RESET_AFTER_LOST_FRAMES = 15;

const WATCH_TUNING = {
  /** Watch case diameter and wrist width in metres, for metric sizing */
  caseMeters: 0.040,
  wristMeters: 0.06,
  /**
   * On a fist the wrist landmark lands a couple of centimetres down the
   * forearm; pull the case back towards the hand by this much (in wrist
   * widths) for a closed hand, fading to nothing for an open one.
   */
  fistPull: 0.3,
  /** Fallbacks when hand world landmarks are unavailable */
  /** Wrist width relative to the knuckle span (index MCP to pinky MCP) */
  wristToKnuckles: 0.82,
  /** Wrist width relative to the palm length (wrist to middle MCP) */
  wristToPalm: 0.6,
  /** Case (incl. lugs) width relative to the wrist width */
  caseToWrist: 0.92,
  /** How far below the wrist joint the case sits, relative to wrist width */
  forearmOffset: 0.08,
  /** Visible strap band across the wrist, relative to the case width */
  strapBand: 1.75,
  /** Fraction of the band that is fully opaque before fading over the edge */
  strapSolid: 0.6,
  /** Hysteresis before flipping which way 12 o'clock points */
  flipMargin: 0.35,
};

const NECKLACE_TUNING = {
  /** Chain spread at the neck relative to the shoulder span (pose) */
  chainToShoulders: 0.32,
  /** Neck base sits this far above the shoulder midpoint, relative to span */
  neckLift: 0.11,
  /** Fallbacks when only the face is tracked, relative to jaw width */
  chainToJaw: 1.25,
  neckDropFromChin: 0.55,
};

export class TryOnEngine {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private destroyed = false;
  private overlayCanvas: HTMLCanvasElement | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;

  private vision: Vision | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private faceLandmarker: FaceLandmarker | null = null;
  private poseLandmarker: PoseLandmarker | null = null;
  private poseLoading: Promise<void> | null = null;

  private ringAsset: LoadedImage | null = null;
  private necklaceAsset: LoadedImage | null = null;
  private glassesAsset: LoadedImage | null = null;
  private watchAsset: LoadedImage | null = null;
  private watchGeometry: WatchGeometry = DEFAULT_WATCH_GEOMETRY;
  private watchGeometryCache = new Map<string, WatchGeometry>();
  private necklaceBounds: AlphaBounds = DEFAULT_ALPHA_BOUNDS;
  private necklaceBoundsCache = new Map<string, AlphaBounds>();
  private imageCache = new Map<string, LoadedImage>();

  private animationId = 0;
  private running = false;
  private activeProduct: Product | null = null;
  private facingMode: CameraFacing = 'user';
  private mirror = true;
  private lastTimestamp = -1;

  // Low base rates hide landmark jitter while still; the adaptive max lets
  // every overlay keep up with real movement instead of trailing behind it.
  private ringCenter = new SmoothPoint(0.2, { max: 0.85, scale: 30, dead: 2 });
  private ringScale = new SmoothValue(0.12, { max: 0.6, scale: 0.3, dead: 0.02 });
  private ringRotation = new SmoothAngle(0.18, { max: 0.7, scale: 0.4, dead: 0.02 });

  private neckCenter = new SmoothPoint(0.3, { max: 0.85, scale: 40 });
  private neckScale = new SmoothValue(0.3, { max: 0.7, scale: 0.3 });
  private neckRotation = new SmoothAngle(0.3, { max: 0.7, scale: 0.5 });

  private glassesCenter = new SmoothPoint(0.4, { max: 0.9, scale: 30 });
  private glassesScale = new SmoothValue(0.35, { max: 0.8, scale: 0.3 });
  private glassesRotation = new SmoothAngle(0.3, { max: 0.8, scale: 0.4 });

  private watchCenter = new SmoothPoint(0.12, { max: 0.85, scale: 40, dead: 3 });
  private watchScale = new SmoothValue(0.1, { max: 0.6, scale: 0.3, dead: 0.02 });
  private watchRotation = new SmoothAngle(0.12, { max: 0.7, scale: 0.5, dead: 0.02 });
  /** 0 or PI: which perpendicular of the forearm 12 o'clock currently points to */
  private watchFlip: number | null = null;
  private watchCanvas: HTMLCanvasElement | null = null;
  private watchArmDir = new SmoothPoint(0.2, { max: 0.8, scale: 0.6, dead: 0.03 });
  private lastPose: NormalizedLandmark[] | null = null;
  private poseFrame = 0;

  /** ?debug in the URL draws landmarks and the arm axis over the video. */
  private debug = typeof location !== 'undefined' && /[?&]debug/.test(location.search);
  private lastFrameTime = 0;
  private frameCount = 0;
  private lastTracking = false;
  private lostFrames = 0;
  /** Redraws the last overlay, used to bridge short detection dropouts */
  private lastDraw: (() => void) | null = null;
  private callbacks: EngineCallbacks;

  constructor(callbacks: EngineCallbacks) {
    this.callbacks = callbacks;
  }

  async init(elements: EngineElements, options: EngineInitOptions = {}) {
    this.video = elements.videoElement;
    this.overlayCanvas = elements.overlayCanvas;
    this.overlayCtx = this.overlayCanvas.getContext('2d');
    this.facingMode = options.facingMode ?? 'user';
    this.mirror = this.facingMode === 'user';

    if (!this.overlayCtx) {
      throw new Error('Could not get overlay 2D context');
    }

    this.callbacks.onStatus('loading', 'Starting camera & tracking...');

    await Promise.all([
      this.initCamera(),
      this.initMediaPipe(),
      this.preloadAllProducts(),
    ]);

    this.callbacks.onStatus('ready');
  }

  async preloadAllProducts() {
    const urls = [...new Set(PRODUCTS.map((p) => p.image))];
    await Promise.all(
      urls.map((u) =>
        this.getImage(u).catch(() => {
          // ignore individual asset load errors
        }),
      ),
    );
  }

  getCameraFacing(): CameraFacing {
    return this.facingMode;
  }

  async switchCamera(facing: CameraFacing) {
    if (facing === this.facingMode) return;
    this.facingMode = facing;
    this.mirror = facing === 'user';
    this.resetSmoothing();
    this.lastTimestamp = -1;

    this.stopStream();

    this.callbacks.onStatus('loading', 'Switching camera...');
    await this.initCamera();
    this.callbacks.onStatus('ready');
  }

  private stopStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private async requestStream(): Promise<MediaStream> {
    const facingMode = { ideal: this.facingMode };
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (err) {
      // Some cameras reject resolution hints; retry with the bare minimum.
      if (err instanceof DOMException && err.name === 'OverconstrainedError') {
        return navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
      }
      throw err;
    }
  }

  private async initCamera() {
    if (!window.isSecureContext) {
      throw new Error('Camera requires HTTPS. Open this page over https:// to use the try-on.');
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        'Camera API is not available. Use HTTPS and a modern browser (Chrome, Safari, or Firefox).',
      );
    }

    if (!this.video) {
      throw new Error('Video element not provided');
    }

    let stream: MediaStream;
    try {
      stream = await this.requestStream();
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          throw new Error('Camera permission denied. Allow camera access in your browser.');
        }
        if (err.name === 'NotReadableError') {
          throw new Error('Camera is in use by another app or tab. Close it and retry.');
        }
        if (err.name === 'NotFoundError') {
          throw new Error(
            this.facingMode === 'environment'
              ? 'No back camera found on this device.'
              : 'No front camera found on this device.',
          );
        }
      }
      throw err;
    }

    if (this.destroyed) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('Engine was destroyed');
    }

    this.stream = stream;
    this.video.srcObject = stream;
    this.video.playsInline = true;
    this.video.muted = true;
    await this.video.play();

    await new Promise<void>((resolve, reject) => {
      const started = performance.now();
      const check = () => {
        if (this.destroyed) reject(new Error('Engine was destroyed'));
        else if (this.video && this.video.videoWidth > 0) resolve();
        else if (performance.now() - started > 5000) {
          reject(new Error('Camera did not deliver any video. Retry or try another browser.'));
        } else requestAnimationFrame(check);
      };
      check();
    });

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (this.overlayCanvas) {
      this.overlayCanvas.width = vw;
      this.overlayCanvas.height = vh;
    }
  }

  /**
   * Body pose (shoulders, elbows, wrists) is only needed for watches and
   * necklaces, so it loads on first use; those products fall back to hand /
   * face-only placement until it is ready.
   */
  private ensurePose(): Promise<void> {
    if (this.poseLandmarker || this.destroyed) return Promise.resolve();
    if (this.poseLoading) return this.poseLoading;
    this.poseLoading = (async () => {
      const vision = this.vision ?? (await FilesetResolver.forVisionTasks(WASM_CDN));
      const load = (delegate: 'GPU' | 'CPU') =>
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: POSE_MODEL, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
      let pose: PoseLandmarker;
      try {
        pose = await load('GPU');
      } catch {
        pose = await load('CPU');
      }
      if (this.destroyed) {
        pose.close();
        return;
      }
      this.poseLandmarker = pose;
    })().catch(() => {
      // Pose is an enhancement; keep running on hand / face tracking alone.
      this.poseLoading = null;
    });
    return this.poseLoading;
  }

  private async initMediaPipe() {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
    this.vision = vision;

    const loadFace = (delegate: 'GPU' | 'CPU') =>
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
      });

    const loadHand = (delegate: 'GPU' | 'CPU') =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
      });

    try {
      [this.faceLandmarker, this.handLandmarker] = await Promise.all([
        loadFace('GPU'),
        loadHand('GPU'),
      ]);
    } catch {
      [this.faceLandmarker, this.handLandmarker] = await Promise.all([
        loadFace('CPU'),
        loadHand('CPU'),
      ]);
    }

    if (this.destroyed) {
      this.faceLandmarker?.close();
      this.handLandmarker?.close();
      this.faceLandmarker = null;
      this.handLandmarker = null;
    }
  }

  /** Pose changes slowly relative to the hand, so it runs every other frame. */
  private detectPose(ts: number): NormalizedLandmark[] | null {
    if (!this.poseLandmarker || !this.video) return null;
    if (this.poseFrame++ % 2 === 0) {
      const res = this.poseLandmarker.detectForVideo(this.video, ts);
      this.lastPose = res.landmarks[0] ?? null;
    }
    return this.lastPose;
  }

  private visible(lm: NormalizedLandmark | undefined): lm is NormalizedLandmark {
    return !!lm && (lm.visibility ?? 1) >= POSE_MIN_VISIBILITY;
  }

  async getImage(url: string): Promise<LoadedImage> {
    const cached = this.imageCache.get(url);
    if (cached) return cached;
    const loaded = await this.loadImage(url);
    this.imageCache.set(url, loaded);
    return loaded;
  }

  private loadImage(url: string): Promise<LoadedImage> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          image: img,
          aspect: img.naturalWidth / (img.naturalHeight || 1),
        });
      };
      img.onerror = () => reject(new Error(`Failed to load ${url}`));
      img.src = url;
    });
  }

  private resetSmoothing() {
    this.ringCenter.reset();
    this.ringScale.reset();
    this.ringRotation.reset();
    this.neckCenter.reset();
    this.neckScale.reset();
    this.neckRotation.reset();
    this.glassesCenter.reset();
    this.glassesScale.reset();
    this.glassesRotation.reset();
    this.watchCenter.reset();
    this.watchScale.reset();
    this.watchRotation.reset();
    this.resetWatchArmState();
  }

  private resetWatchArmState() {
    this.watchArmDir.reset();
    this.watchFlip = null;
  }

  async setProduct(product: Product) {
    if (this.activeProduct?.id === product.id) return;
    this.activeProduct = product;
    this.resetSmoothing();
    this.lastTracking = false;
    this.lastDraw = null;
    this.lostFrames = RESET_AFTER_LOST_FRAMES;

    const loaded = await this.getImage(product.image);
    // A newer selection arrived while this image was loading.
    if (this.activeProduct !== product) return;
    if (product.type === 'watch' || product.type === 'necklace') {
      void this.ensurePose();
    }
    switch (product.type) {
      case 'necklace': {
        let bounds = this.necklaceBoundsCache.get(product.image);
        if (!bounds) {
          bounds = measureAlphaBounds(loaded.image);
          this.necklaceBoundsCache.set(product.image, bounds);
        }
        this.necklaceBounds = bounds;
        this.necklaceAsset = loaded;
        break;
      }
      case 'glasses':
        this.glassesAsset = loaded;
        break;
      case 'ring':
        this.ringAsset = loaded;
        break;
      case 'watch': {
        let geometry = this.watchGeometryCache.get(product.image);
        if (!geometry) {
          geometry = measureWatchGeometry(loaded.image);
          this.watchGeometryCache.set(product.image, geometry);
        }
        this.watchGeometry = geometry;
        this.watchAsset = loaded;
        break;
      }
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.lastTimestamp = -1;
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
  }

  private loop = () => {
    if (!this.running) return;
    this.animationId = requestAnimationFrame(this.loop);
    this.renderFrame();
  };

  private nextTimestamp(): number {
    if (!this.video) return 0;
    const t = this.video.currentTime * 1000;
    if (t <= this.lastTimestamp) {
      this.lastTimestamp += 1;
      return this.lastTimestamp;
    }
    this.lastTimestamp = t;
    return t;
  }

  private renderFrame() {
    if (!this.video || !this.overlayCtx || !this.overlayCanvas) {
      return;
    }

    const vw = this.overlayCanvas.width;
    const vh = this.overlayCanvas.height;
    const product = this.activeProduct;
    const now = performance.now();

    this.frameCount++;
    if (now - this.lastFrameTime >= 1000) {
      this.callbacks.onFps?.(this.frameCount);
      this.frameCount = 0;
      this.lastFrameTime = now;
    }

    this.overlayCtx.clearRect(0, 0, vw, vh);

    // No frame yet (e.g. mid camera switch); detectForVideo would throw.
    if (!product || this.video.readyState < 2) return;

    const ts = this.nextTimestamp();
    let detected = false;
    // True when the target was just re-acquired after a real loss.
    const fresh = this.lostFrames >= RESET_AFTER_LOST_FRAMES;

    switch (product.type) {
      case 'glasses': {
        if (!this.faceLandmarker) break;
        const res = this.faceLandmarker.detectForVideo(this.video, ts);
        if (res.faceLandmarks.length > 0) {
          detected = true;
          if (fresh) {
            this.glassesCenter.reset();
            this.glassesScale.reset();
            this.glassesRotation.reset();
          }
          if (this.glassesAsset) this.drawGlasses(res, vw, vh);
        }
        break;
      }
      case 'necklace': {
        const pose = this.detectPose(ts);
        const face = this.faceLandmarker?.detectForVideo(this.video, ts);
        const target = this.necklaceTarget(pose, face?.faceLandmarks[0], vw, vh);
        if (target) {
          detected = true;
          if (fresh) {
            this.neckCenter.reset();
            this.neckScale.reset();
            this.neckRotation.reset();
          }
          if (this.necklaceAsset) this.drawNecklace(target);
        }
        break;
      }
      case 'ring':
      case 'watch': {
        if (!this.handLandmarker) break;
        const res = this.handLandmarker.detectForVideo(this.video, ts);
        if (res.landmarks.length > 0) {
          detected = true;
          if (fresh) {
            this.ringCenter.reset();
            this.ringScale.reset();
            this.ringRotation.reset();
            this.watchCenter.reset();
            this.watchScale.reset();
            this.watchRotation.reset();
            this.resetWatchArmState();
          }
          if (product.type === 'ring' && this.ringAsset) {
            this.drawRing(res, vw, vh);
          } else if (product.type === 'watch' && this.watchAsset) {
            this.drawWatch(res, this.detectPose(ts), vw, vh);
          }
        }
        break;
      }
    }

    let tracking = detected;
    if (detected) {
      this.lostFrames = 0;
    } else {
      this.lostFrames++;
      if (this.lostFrames <= HOLD_FRAMES && this.lastDraw) {
        this.lastDraw();
        tracking = true;
      } else {
        this.lastDraw = null;
      }
    }

    if (tracking !== this.lastTracking) {
      this.lastTracking = tracking;
      this.callbacks.onTracking?.(tracking);
    }
  }

  private toScreen(x: number, y: number, w: number, h: number) {
    const sx = this.mirror ? (1 - x) * w : x * w;
    const sy = y * h;
    return { x: sx, y: sy };
  }

  private drawImageAt(
    asset: LoadedImage,
    x: number,
    y: number,
    width: number,
    angle: number,
    anchorX = 0.5,
    anchorY = 0.5,
    flipV = false,
  ) {
    this.lastDraw = () => this.paintImage(asset, x, y, width, angle, anchorX, anchorY, flipV);
    this.paintImage(asset, x, y, width, angle, anchorX, anchorY, flipV);
  }

  private paintImage(
    asset: LoadedImage,
    x: number,
    y: number,
    width: number,
    angle: number,
    anchorX: number,
    anchorY: number,
    flipV: boolean,
  ) {
    if (!this.overlayCtx) return;
    const height = width / asset.aspect;
    this.overlayCtx.save();
    this.overlayCtx.translate(x, y);
    this.overlayCtx.rotate(angle);
    if (flipV) {
      this.overlayCtx.scale(1, -1);
    }
    this.overlayCtx.drawImage(
      asset.image,
      -width * anchorX,
      -height * anchorY,
      width,
      height,
    );
    this.overlayCtx.restore();
  }

  /**
   * Where the necklace hangs: the neck base (top-centre of the chain), the
   * chain spread there, and the shoulder tilt. Pose shoulders give the real
   * chest position; the face alone is a rougher fallback.
   */
  private necklaceTarget(
    pose: NormalizedLandmark[] | null,
    face: NormalizedLandmark[] | undefined,
    w: number,
    h: number,
  ): { center: Pt; width: number; angle: number } | null {
    const ls = pose?.[POSE.leftShoulder];
    const rs = pose?.[POSE.rightShoulder];
    if (this.visible(ls) && this.visible(rs)) {
      const a = this.toScreen(ls.x, ls.y, w, h);
      const b = this.toScreen(rs.x, rs.y, w, h);
      // Order by screen x so the angle is near 0 whether or not we mirror.
      const [l, r] = a.x <= b.x ? [a, b] : [b, a];
      const span = Math.hypot(r.x - l.x, r.y - l.y);
      if (span > w * 0.05) {
        const angle = Math.atan2(r.y - l.y, r.x - l.x);
        // "Up" relative to the shoulder line, so the neck base follows a tilt.
        const upX = Math.sin(angle);
        const upY = -Math.cos(angle);
        const lift = span * NECKLACE_TUNING.neckLift;
        return {
          center: {
            x: (l.x + r.x) / 2 + upX * lift,
            y: (l.y + r.y) / 2 + upY * lift,
          },
          width: span * NECKLACE_TUNING.chainToShoulders,
          angle,
        };
      }
    }

    if (face) {
      const a = this.toScreen(face[172].x, face[172].y, w, h);
      const b = this.toScreen(face[397].x, face[397].y, w, h);
      const chin = this.toScreen(face[152].x, face[152].y, w, h);
      const [l, r] = a.x <= b.x ? [a, b] : [b, a];
      const jaw = Math.hypot(r.x - l.x, r.y - l.y);
      const angle = Math.atan2(r.y - l.y, r.x - l.x);
      const downX = -Math.sin(angle);
      const downY = Math.cos(angle);
      const drop = jaw * NECKLACE_TUNING.neckDropFromChin;
      return {
        center: { x: chin.x + downX * drop, y: chin.y + downY * drop },
        width: jaw * NECKLACE_TUNING.chainToJaw,
        angle,
      };
    }

    return null;
  }

  private drawNecklace(target: { center: Pt; width: number; angle: number }) {
    if (!this.necklaceAsset) return;
    const b = this.necklaceBounds;
    const opaqueWidth = Math.max(0.05, b.right - b.left);
    const imageWidth = target.width / opaqueWidth;

    const pos = this.neckCenter.update(target.center.x, target.center.y);
    const width = this.neckScale.update(imageWidth);
    const angle = this.neckRotation.update(target.angle);

    // Anchor at the top-centre of the chain so it hangs from the neck base.
    this.drawImageAt(
      this.necklaceAsset,
      pos.x,
      pos.y,
      width,
      angle,
      (b.left + b.right) / 2,
      b.top,
    );
  }

  private drawRing(
    result: ReturnType<HandLandmarker['detectForVideo']>,
    w: number,
    h: number,
  ) {
    if (!this.ringAsset || !this.activeProduct) return;

    let bestIndex = 0;
    let bestScore = -1;
    result.landmarks.forEach((hand, i) => {
      const ringMcp = hand[13];
      const ringPip = hand[14];
      const ringTip = hand[16];
      const score =
        Math.hypot(ringTip.x - ringMcp.x, ringTip.y - ringMcp.y) *
        Math.hypot(ringTip.x - ringPip.x, ringTip.y - ringPip.y);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    });
    const bestHand = result.landmarks[bestIndex];
    const pxPerMeter = this.handPxPerMeter(
      bestHand,
      result.worldLandmarks?.[bestIndex],
      w,
      h,
    );

    const ringMcp = bestHand[13];
    const ringPip = bestHand[14];
    const middleMcp = bestHand[9];
    const middlePip = bestHand[10];
    const wrist = bestHand[0];

    const along = 0.55;
    const mcpPt = this.toScreen(ringMcp.x, ringMcp.y, w, h);
    const pipPt = this.toScreen(ringPip.x, ringPip.y, w, h);

    const centerX = mcpPt.x + (pipPt.x - mcpPt.x) * along;
    const centerY = mcpPt.y + (pipPt.y - mcpPt.y) * along;

    const sizing = estimateFingerSize({
      ringMcp,
      ringPip,
      middleMcp,
      middlePip,
      wrist,
      alongFinger: along,
      frameW: w,
      frameH: h,
      toScreen: (x, y) => this.toScreen(x, y, w, h),
    });

    const tuning = RING_TUNING[this.activeProduct.id] ?? DEFAULT_RING_TUNING;
    // Real-world sizing when the metric hand is available; the on-screen
    // finger geometry is only a fallback since it changes with hand pose.
    const ringOuterWidth = pxPerMeter
      ? RING_OUTER_METERS * pxPerMeter
      : sizing.ringOuterWidth;
    const ringWidth = ringOuterWidth / tuning.bandRatio;
    const angle = Math.atan2(pipPt.y - mcpPt.y, pipPt.x - mcpPt.x) + Math.PI / 2;

    const smoothPos = this.ringCenter.update(centerX, centerY);
    const smoothScale = this.ringScale.update(ringWidth);
    const smoothAngle = this.ringRotation.update(angle);

    this.drawImageAt(
      this.ringAsset,
      smoothPos.x,
      smoothPos.y,
      smoothScale,
      smoothAngle,
      0.5,
      tuning.anchorY,
    );
  }

  private drawGlasses(
    result: ReturnType<FaceLandmarker['detectForVideo']>,
    w: number,
    h: number,
  ) {
    if (!this.glassesAsset || !this.activeProduct) return;

    const lm = result.faceLandmarks[0];
    const leftEyeOuter = lm[33];
    const rightEyeOuter = lm[263];
    const leftEyeInner = lm[133];
    const rightEyeInner = lm[362];
    const leftEyeTop = lm[159];
    const rightEyeTop = lm[386];
    const noseBridge = lm[6];
    const leftEar = lm[234];
    const rightEar = lm[454];

    const leftEyeOuterPt = this.toScreen(leftEyeOuter.x, leftEyeOuter.y, w, h);
    const rightEyeOuterPt = this.toScreen(rightEyeOuter.x, rightEyeOuter.y, w, h);
    const leftEyeInnerPt = this.toScreen(leftEyeInner.x, leftEyeInner.y, w, h);
    const rightEyeInnerPt = this.toScreen(rightEyeInner.x, rightEyeInner.y, w, h);
    const leftEyeTopPt = this.toScreen(leftEyeTop.x, leftEyeTop.y, w, h);
    const rightEyeTopPt = this.toScreen(rightEyeTop.x, rightEyeTop.y, w, h);
    const noseBridgePt = this.toScreen(noseBridge.x, noseBridge.y, w, h);
    const leftEarPt = this.toScreen(leftEar.x, leftEar.y, w, h);
    const rightEarPt = this.toScreen(rightEar.x, rightEar.y, w, h);

    const eyeOuterSpan = Math.hypot(
      rightEyeOuterPt.x - leftEyeOuterPt.x,
      rightEyeOuterPt.y - leftEyeOuterPt.y,
    );
    const eyeInnerSpan = Math.hypot(
      rightEyeInnerPt.x - leftEyeInnerPt.x,
      rightEyeInnerPt.y - leftEyeInnerPt.y,
    );
    const earSpan = Math.hypot(
      rightEarPt.x - leftEarPt.x,
      rightEarPt.y - leftEarPt.y,
    );

    const eyeMidX = (leftEyeTopPt.x + rightEyeTopPt.x) / 2;
    const eyeMidY = (leftEyeTopPt.y + rightEyeTopPt.y) / 2;
    const centerX = eyeMidX * 0.85 + noseBridgePt.x * 0.15;
    const centerY = eyeMidY * 0.92 + noseBridgePt.y * 0.08;

    const spanEstimate = eyeOuterSpan * 1.75 + eyeInnerSpan * 0.1;
    const earEstimate = earSpan * 0.88;

    const tuning = GLASSES_TUNING[this.activeProduct.id] ?? DEFAULT_GLASSES_TUNING;
    const rawWidth = Math.max(spanEstimate, earEstimate) * tuning.widthFactor;
    const angle = Math.atan2(
      rightEyeTopPt.y - leftEyeTopPt.y,
      rightEyeTopPt.x - leftEyeTopPt.x,
    );

    const smoothPos = this.glassesCenter.update(centerX, centerY);
    const smoothScale = this.glassesScale.update(rawWidth);
    const smoothAngle = this.glassesRotation.update(angle);

    this.drawImageAt(
      this.glassesAsset,
      smoothPos.x,
      smoothPos.y,
      smoothScale,
      smoothAngle,
      tuning.anchorX,
      tuning.anchorY,
      this.mirror,
    );
  }

  private normalizeDir(x: number, y: number) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  private estimateWristBreadth(
    indexPt: { x: number; y: number },
    pinkyPt: { x: number; y: number },
    arm: { x: number; y: number },
  ) {
    const knuckleSpan = Math.hypot(pinkyPt.x - indexPt.x, pinkyPt.y - indexPt.y);
    const perpX = -arm.y;
    const perpY = arm.x;
    const indexSide = indexPt.x * perpX + indexPt.y * perpY;
    const pinkySide = pinkyPt.x * perpX + pinkyPt.y * perpY;
    const projectedSpan = Math.abs(indexSide - pinkySide);
    return Math.max(knuckleSpan, projectedSpan);
  }

  /**
   * Forearm direction (elbow -> wrist, i.e. towards the hand) from the pose
   * skeleton, for the pose wrist nearest the tracked hand. Null if the arm is
   * not visible, in which case the hand-only heuristics below take over.
   */
  private poseArmAxis(
    pose: NormalizedLandmark[] | null,
    handWristPt: Pt,
    w: number,
    h: number,
    maxDist: number,
  ): Pt | null {
    if (!pose) return null;
    let best: Pt | null = null;
    let bestDist = maxDist;
    const sides: [number, number][] = [
      [POSE.leftWrist, POSE.leftElbow],
      [POSE.rightWrist, POSE.rightElbow],
    ];
    for (const [wi, ei] of sides) {
      const wrist = pose[wi];
      const elbow = pose[ei];
      if (!this.visible(wrist) || !this.visible(elbow)) continue;
      if ((elbow.visibility ?? 1) < POSE_ELBOW_MIN_VISIBILITY) continue;
      const wp = this.toScreen(wrist.x, wrist.y, w, h);
      const ep = this.toScreen(elbow.x, elbow.y, w, h);
      // An elbow outside the frame is extrapolated, not seen.
      if (ep.x < 0 || ep.x > w || ep.y < 0 || ep.y > h) continue;
      const dist = Math.hypot(wp.x - handWristPt.x, wp.y - handWristPt.y);
      const len = Math.hypot(wp.x - ep.x, wp.y - ep.y);
      if (dist < bestDist && len > w * 0.03) {
        bestDist = dist;
        best = { x: (wp.x - ep.x) / len, y: (wp.y - ep.y) / len };
      }
    }
    return best;
  }

  /**
   * Screen pixels per metre for this hand, from the metric world landmarks.
   * Foreshortening can only shrink a pixel distance, so the least
   * foreshortened landmark pairs (largest px/m) carry the true scale; this is
   * independent of whether the hand is a fist, flat, or edge-on.
   */
  private handPxPerMeter(
    hand: NormalizedLandmark[],
    world: Landmark[] | undefined,
    w: number,
    h: number,
  ): number | null {
    if (!world || world.length < 21) return null;
    const pairs: [number, number][] = [
      [0, 5], [0, 9], [0, 13], [0, 17], [5, 17], [5, 9], [9, 13], [13, 17], [0, 2], [2, 5],
    ];
    const ratios: number[] = [];
    for (const [a, b] of pairs) {
      const pa = this.toScreen(hand[a].x, hand[a].y, w, h);
      const pb = this.toScreen(hand[b].x, hand[b].y, w, h);
      const px = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      const m = Math.hypot(
        world[a].x - world[b].x,
        world[a].y - world[b].y,
        world[a].z - world[b].z,
      );
      if (m > 0.01) ratios.push(px / m);
    }
    if (ratios.length < 4) return null;
    // Upper third rather than the maximum: a single noisy pair would inflate it.
    ratios.sort((x, y) => y - x);
    return ratios[Math.floor(ratios.length * 0.3)];
  }

  /**
   * 0 for a closed fist up to ~1 for an open hand: mean fingertip-to-knuckle
   * distance over palm length, in metric space so it ignores camera angle.
   */
  private handOpenness(world: Landmark[] | undefined): number | null {
    if (!world || world.length < 21) return null;
    const d = (a: number, b: number) =>
      Math.hypot(world[a].x - world[b].x, world[a].y - world[b].y, world[a].z - world[b].z);
    const palm = d(0, 9) || 1;
    const curl = (d(8, 5) + d(12, 9) + d(16, 13) + d(20, 17)) / 4 / palm;
    return Math.min(1, Math.max(0, (curl - 0.35) / 0.6));
  }

  private drawWatch(
    result: ReturnType<HandLandmarker['detectForVideo']>,
    pose: NormalizedLandmark[] | null,
    w: number,
    h: number,
  ) {
    if (!this.watchAsset) return;

    let bestIndex = 0;
    let bestScore = -1;
    for (let i = 0; i < result.landmarks.length; i++) {
      const hand = result.landmarks[i];
      const wristLm = hand[0];
      const middleLm = hand[9];
      const score = Math.hypot(middleLm.x - wristLm.x, middleLm.y - wristLm.y);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    const bestHand = result.landmarks[bestIndex];
    const world = result.worldLandmarks?.[bestIndex];
    const pxPerMeter = this.handPxPerMeter(bestHand, world, w, h);
    const openness = this.handOpenness(world) ?? 1;

    const wrist = bestHand[0];
    const indexMcp = bestHand[5];
    const pinkyMcp = bestHand[17];
    const middleMcp = bestHand[9];

    const wristPt = this.toScreen(wrist.x, wrist.y, w, h);
    const indexPt = this.toScreen(indexMcp.x, indexMcp.y, w, h);
    const pinkyPt = this.toScreen(pinkyMcp.x, pinkyMcp.y, w, h);
    const middlePt = this.toScreen(middleMcp.x, middleMcp.y, w, h);
    const knuckleSpan = Math.hypot(pinkyPt.x - indexPt.x, pinkyPt.y - indexPt.y);

    // Forearm direction, pointing towards the hand. The pose skeleton is best;
    // otherwise the hand itself continues the forearm line unless the wrist is
    // bent, so wrist -> middle knuckle is a sound fallback in any hand pose.
    const target =
      this.poseArmAxis(pose, wristPt, w, h, knuckleSpan * 1.5) ??
      this.normalizeDir(middlePt.x - wristPt.x, middlePt.y - wristPt.y);

    const smoothArm = this.watchArmDir.update(target.x, target.y);
    const armAxis = this.normalizeDir(smoothArm.x, smoothArm.y);

    if (this.debug && this.overlayCtx) {
      const c = this.overlayCtx;
      c.save();
      c.lineWidth = 3;
      for (const lm of bestHand) {
        const pt = this.toScreen(lm.x, lm.y, w, h);
        c.fillStyle = '#00e5ff';
        c.fillRect(pt.x - 3, pt.y - 3, 6, 6);
      }
      if (pose) {
        for (const i of [11, 12, 13, 14, 15, 16]) {
          const pt = this.toScreen(pose[i].x, pose[i].y, w, h);
          c.fillStyle = (pose[i].visibility ?? 1) >= POSE_MIN_VISIBILITY ? '#ffeb3b' : '#ff5722';
          c.beginPath();
          c.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.strokeStyle = '#ff00ff';
      c.beginPath();
      c.moveTo(wristPt.x, wristPt.y);
      c.lineTo(wristPt.x + armAxis.x * 120, wristPt.y + armAxis.y * 120);
      c.stroke();
      c.fillStyle = '#fff';
      c.font = '16px monospace';
      c.fillText(
        `pose:${this.poseLandmarker ? 'on' : 'off'} axis:${armAxis.x.toFixed(2)},${armAxis.y.toFixed(2)} knuckles:${knuckleSpan.toFixed(0)} px/cm:${pxPerMeter ? (pxPerMeter / 100).toFixed(1) : '-'} open:${openness.toFixed(2)}`,
        160,
        h - 16,
      );
      c.restore();
    }

    const palmLen = Math.hypot(
      (middleMcp.x - wrist.x) * w,
      (middleMcp.y - wrist.y) * h,
      (middleMcp.z - wrist.z) * w,
    );
    let wristBreadth: number;
    let caseWidth: number;
    if (pxPerMeter) {
      wristBreadth = WATCH_TUNING.wristMeters * pxPerMeter;
      caseWidth = WATCH_TUNING.caseMeters * pxPerMeter;
    } else {
      // Knuckle span foreshortens on a fist, palm length on a flat hand facing
      // the camera edge-on; the larger of the two is the better wrist estimate.
      wristBreadth = Math.max(
        this.estimateWristBreadth(indexPt, pinkyPt, armAxis) * WATCH_TUNING.wristToKnuckles,
        palmLen * WATCH_TUNING.wristToPalm,
      );
      caseWidth = wristBreadth * WATCH_TUNING.caseToWrist;
    }
    const watchWidth = caseWidth / this.watchGeometry.caseWidthFrac;
    const alongArm = WATCH_TUNING.forearmOffset - WATCH_TUNING.fistPull * (1 - openness);
    const watchX = wristPt.x - armAxis.x * wristBreadth * alongArm;
    const watchY = wristPt.y - armAxis.y * wristBreadth * alongArm;

    // The strap wraps around the wrist, so the 12-6 axis is perpendicular to
    // the forearm. Two perpendiculars are possible; prefer the one that puts
    // 12 o'clock upwards on screen (how people read a watch), and near a
    // vertical forearm, where neither is "up", put the crown towards the hand.
    // Hysteresis stops it flipping as the arm passes through vertical.
    const crownToHand = Math.atan2(armAxis.y, armAxis.x);
    const upness = (flip: number) => Math.cos(crownToHand + flip);
    if (this.watchFlip === null) {
      this.watchFlip = upness(Math.PI) > upness(0) + WATCH_TUNING.flipMargin ? Math.PI : 0;
    } else {
      const other = this.watchFlip === 0 ? Math.PI : 0;
      if (upness(other) > upness(this.watchFlip) + WATCH_TUNING.flipMargin) {
        this.watchFlip = other;
        // Snap rather than spin the dial half a turn.
        this.watchRotation.reset();
      }
    }
    const angle = crownToHand + this.watchFlip;

    const smoothPos = this.watchCenter.update(watchX, watchY);
    const smoothScale = this.watchScale.update(watchWidth);
    const rotation = this.watchRotation.update(angle);
    const smoothCase = smoothScale * this.watchGeometry.caseWidthFrac;

    this.drawWatchWrapped(
      this.watchAsset,
      smoothPos.x,
      smoothPos.y,
      smoothScale,
      rotation,
      this.watchGeometry.caseCenterY,
      smoothCase * WATCH_TUNING.strapBand,
    );
  }

  /**
   * Draws the flat product shot as if wrapped around a cylinder of the given
   * band width: the strap fades out and darkens where it curves over the
   * wrist's edges instead of lying flat on top of the arm.
   */
  private drawWatchWrapped(
    asset: LoadedImage,
    x: number,
    y: number,
    width: number,
    angle: number,
    anchorY: number,
    band: number,
  ) {
    this.lastDraw = () => this.paintWatchWrapped(asset, x, y, width, angle, anchorY, band);
    this.paintWatchWrapped(asset, x, y, width, angle, anchorY, band);
  }

  private paintWatchWrapped(
    asset: LoadedImage,
    x: number,
    y: number,
    width: number,
    angle: number,
    anchorY: number,
    band: number,
  ) {
    if (!this.overlayCtx || width < 2) return;
    const height = width / asset.aspect;
    const cw = Math.ceil(width);
    const ch = Math.ceil(height);
    const off = (this.watchCanvas ??= document.createElement('canvas'));
    if (off.width !== cw || off.height !== ch) {
      off.width = cw;
      off.height = ch;
    }
    const octx = off.getContext('2d');
    if (!octx) return;

    octx.globalCompositeOperation = 'source-over';
    octx.clearRect(0, 0, cw, ch);
    octx.drawImage(asset.image, 0, 0, width, height);

    // Strap runs along the image's y axis; the wrist band is centred on the case.
    const centerY = anchorY * height;
    const half = band / 2;
    const solid = half * WATCH_TUNING.strapSolid;
    const stop = (v: number) => Math.min(1, Math.max(0, v / height));

    const alpha = octx.createLinearGradient(0, 0, 0, height);
    alpha.addColorStop(stop(centerY - half), 'rgba(0,0,0,0)');
    alpha.addColorStop(stop(centerY - solid), 'rgba(0,0,0,1)');
    alpha.addColorStop(stop(centerY + solid), 'rgba(0,0,0,1)');
    alpha.addColorStop(stop(centerY + half), 'rgba(0,0,0,0)');
    octx.globalCompositeOperation = 'destination-in';
    octx.fillStyle = alpha;
    octx.fillRect(0, 0, cw, ch);

    // Shade the strap as it turns away from the light over the edges.
    const shade = octx.createLinearGradient(0, 0, 0, height);
    shade.addColorStop(stop(centerY - half), 'rgba(0,0,0,0.5)');
    shade.addColorStop(stop(centerY - solid), 'rgba(0,0,0,0)');
    shade.addColorStop(stop(centerY + solid), 'rgba(0,0,0,0)');
    shade.addColorStop(stop(centerY + half), 'rgba(0,0,0,0.5)');
    octx.globalCompositeOperation = 'source-atop';
    octx.fillStyle = shade;
    octx.fillRect(0, 0, cw, ch);
    octx.globalCompositeOperation = 'source-over';

    this.overlayCtx.save();
    this.overlayCtx.translate(x, y);
    this.overlayCtx.rotate(angle);
    this.overlayCtx.drawImage(off, -width / 2, -centerY);
    this.overlayCtx.restore();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    if (this.video && this.video.srcObject === this.stream) {
      this.video.srcObject = null;
    }
    this.stopStream();
    this.faceLandmarker?.close();
    this.handLandmarker?.close();
    this.poseLandmarker?.close();
    this.faceLandmarker = null;
    this.handLandmarker = null;
    this.poseLandmarker = null;
  }
}
