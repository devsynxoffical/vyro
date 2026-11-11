import {
  FaceLandmarker,
  HandLandmarker,
  PoseLandmarker,
  FilesetResolver,
  type Landmark,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { PRODUCTS, type Product, type ProductType } from '../types';
import { estimateFingerSize } from './fingerSizing';
import {
  PoseFilter,
  SmoothDirection,
  SmoothScalar,
  type PoseFilterParams,
} from './smoothing';
import {
  DEFAULT_WATCH_GEOMETRY,
  measureWatchGeometry,
  type WatchGeometry,
} from './watchGeometry';
import { NECKLACE_STYLES, renderNecklace, type NeckFrame } from './necklaceRenderer';

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
  /** Lets the tracker for the first product download alongside the camera prompt */
  initialProductType?: ProductType;
}

export interface EngineCallbacks {
  onStatus: (status: EngineStatus, message?: string) => void;
  onFps?: (fps: number) => void;
  onTracking?: (tracking: boolean) => void;
  /** True while the tracker the current product needs is still downloading */
  onModelLoading?: (loading: boolean) => void;
}

type ModelKind = 'hand' | 'face' | 'pose';
const MODELS_FOR: Record<ProductType, ModelKind[]> = {
  glasses: ['face'],
  necklace: ['pose', 'face'],
  ring: ['hand'],
  watch: ['hand', 'pose'],
};

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
/** Consecutive detections needed before the product appears */
const ACQUIRE_FRAMES = 3;

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
  /**
   * How far below the wrist crease the case centre sits, relative to wrist
   * width (~1.8 cm on a 6 cm wrist), for an open hand.
   */
  forearmOffset: 0.3,
  /** Visible strap band across the wrist, relative to the case width */
  strapBand: 1.75,
  /** Fraction of the band that is fully opaque before fading over the edge */
  strapSolid: 0.6,
  /** Hysteresis before flipping which way 12 o'clock points */
  flipMargin: 0.35,
};

/**
 * Time-based filter tuning (One Euro). Position speed is measured in reference
 * sizes per second (face width / palm length), so the same numbers hold near
 * and far from the camera. minCutoff: steadiness at rest (lower = steadier);
 * beta: how fast the filter opens up on real movement (higher = less lag).
 */
const FILTERS: Record<ProductType, PoseFilterParams> = {
  glasses: {
    position: { minCutoff: 0.6, beta: 6.0 },
    scale: { minCutoff: 0.5, beta: 0.4 },
    angle: { minCutoff: 1.0, beta: 1.0 },
    maxScaleStep: 0.05,
    scaleDeadband: 0.012,
  },
  necklace: {
    position: { minCutoff: 0.45, beta: 4.0 },
    scale: { minCutoff: 0.3, beta: 0.2 },
    angle: { minCutoff: 0.4, beta: 0.4 },
    maxScaleStep: 0.03,
    scaleDeadband: 0.02,
  },
  ring: {
    position: { minCutoff: 0.7, beta: 6.0 },
    scale: { minCutoff: 0.4, beta: 0.3 },
    angle: { minCutoff: 0.8, beta: 1.0 },
    maxScaleStep: 0.05,
    scaleDeadband: 0.02,
  },
  watch: {
    position: { minCutoff: 0.6, beta: 6.0 },
    scale: { minCutoff: 0.35, beta: 0.2 },
    angle: { minCutoff: 0.7, beta: 0.8 },
    maxScaleStep: 0.05,
    scaleDeadband: 0.02,
  },
};

const NECKLACE_TUNING = {
  /** Average face width (cheekbone to cheekbone) used to scale the scene */
  faceWidthCm: 14,
  /** Neck radius relative to face width */
  neckRadiusToFace: 0.4,
  /** Neck base below the chin, relative to face width */
  neckBaseFromChin: 0.5,
  /** Fallbacks from the pose skeleton only */
  shoulderSpanCm: 38,
  neckRadiusToShoulders: 0.14,
  neckLiftFromShoulders: 0.14,
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
  private modelLoading: Partial<Record<ModelKind, Promise<void>>> = {};
  private modelLoadingNotified = false;

  private ringAsset: LoadedImage | null = null;
  private pendantAsset: LoadedImage | null = null;
  private glassesAsset: LoadedImage | null = null;
  private watchAsset: LoadedImage | null = null;
  private watchGeometry: WatchGeometry = DEFAULT_WATCH_GEOMETRY;
  private watchGeometryCache = new Map<string, WatchGeometry>();
  private neckRadiusRatio = new SmoothScalar({ minCutoff: 0.3, beta: 0.1 });
  /** Shoulder line from the pose model, pre-filtered: it is noisier than the face. */
  private shoulderFilter = new PoseFilter({
    position: { minCutoff: 0.4, beta: 3.0 },
    scale: { minCutoff: 0.3, beta: 0.2 },
    angle: { minCutoff: 0.3, beta: 0.3 },
    maxScaleStep: 0.03,
    scaleDeadband: 0.02,
  });
  /** Closed-mouth chin distance relative to forehead→nose-bridge, learned per user */
  private chinRatio: number | null = null;
  /** 0..0.5: how much the shoulder estimate contributes, faded rather than switched */
  private shoulderWeight = 0;
  private lastShoulders: { mid: Pt; span: number; angle: number } | null = null;
  private lastNeckTime = 0;
  private imageCache = new Map<string, LoadedImage>();

  private animationId = 0;
  private running = false;
  private activeProduct: Product | null = null;
  private facingMode: CameraFacing = 'user';
  private mirror = true;
  private lastTimestamp = -1;

  private ringPose = new PoseFilter(FILTERS.ring);
  private neckPose = new PoseFilter(FILTERS.necklace);
  private glassesPose = new PoseFilter(FILTERS.glasses);
  private glassesYaw = new SmoothScalar({ minCutoff: 1.0, beta: 0.6 });
  private watchPose = new PoseFilter(FILTERS.watch);
  /** Seconds, for the time-based filters */
  private frameTime = 0;
  /** Screen anchor of the hand being tracked, to stay on it when two are visible */
  private handAnchor: Pt | null = null;
  /** Detection only runs when the camera has produced a new frame. */
  private videoFrameReady = true;
  private lastVideoTime = -1;
  private usesVideoFrameCallback = false;
  private lastProcessedAt = 0;
  /** 0 or PI: which perpendicular of the forearm 12 o'clock currently points to */
  private watchFlip: number | null = null;
  private watchCanvas: HTMLCanvasElement | null = null;
  private ringCanvas: HTMLCanvasElement | null = null;
  private watchArmDir = new SmoothDirection({ minCutoff: 0.5, beta: 0.5 });
  private lastPose: NormalizedLandmark[] | null = null;
  private poseFrame = 0;

  /** ?debug in the URL draws landmarks and the arm axis over the video. */
  private debug = typeof location !== 'undefined' && /[?&]debug/.test(location.search);
  private lastFrameTime = 0;
  private frameCount = 0;
  private lastTracking = false;
  private lostFrames = 0;
  private acquiredFrames = 0;
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

    this.callbacks.onStatus('loading', 'Starting camera...');

    // Only the tracker the first product needs gates start-up; it downloads
    // while the camera permission prompt is up. The others load on demand
    // and are also warmed in the background once the camera is running.
    const first = options.initialProductType ?? 'watch';
    const firstModels = Promise.all(MODELS_FOR[first].map((k) => this.ensureModel(k)));
    await Promise.all([this.initCamera(), firstModels]);

    void this.preloadAllProducts();
    for (const kind of ['hand', 'face', 'pose'] as ModelKind[]) void this.ensureModel(kind);

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

  /** Returns the facing actually in use afterwards (may differ on one-camera devices). */
  async switchCamera(facing: CameraFacing): Promise<CameraFacing> {
    if (facing === this.facingMode) return this.facingMode;
    const previous = this.facingMode;
    this.facingMode = facing;
    this.mirror = facing === 'user';
    this.resetSmoothing();
    this.lastDraw = null;
    this.lostFrames = RESET_AFTER_LOST_FRAMES;
    this.acquiredFrames = 0;

    // The old camera must be released before the other one can be opened.
    this.stopStream();
    if (this.video) this.video.srcObject = null;

    this.callbacks.onStatus('loading', 'Switching camera...');
    try {
      await this.initCamera();
    } catch (err) {
      // Put the previous camera back so the user is not left with a black view.
      this.facingMode = previous;
      this.mirror = previous === 'user';
      try {
        await this.initCamera();
        this.callbacks.onStatus('ready');
      } catch {
        // fall through to report the original failure
      }
      throw err;
    }
    this.callbacks.onStatus('ready');
    return this.facingMode;
  }

  private stopStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  /**
   * Asks for the requested camera strictly first: with only an "ideal"
   * facing mode several Android browsers hand back the front camera again,
   * which made the flip button look dead. Falls back to softer constraints
   * (single-camera laptops, cameras that reject resolution hints).
   */
  private async requestStream(): Promise<MediaStream> {
    const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
    const attempts: MediaTrackConstraints[] = [
      { facingMode: { exact: this.facingMode }, ...size },
      { facingMode: { exact: this.facingMode } },
      { facingMode: { ideal: this.facingMode }, ...size },
      { facingMode: { ideal: this.facingMode } },
    ];
    let lastErr: unknown;
    for (const video of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia({ video, audio: false });
      } catch (err) {
        lastErr = err;
        const relaxable =
          err instanceof DOMException &&
          (err.name === 'OverconstrainedError' ||
            err.name === 'ConstraintNotSatisfiedError' ||
            err.name === 'NotFoundError');
        if (!relaxable) throw err;
      }
    }
    throw lastErr;
  }

  /** Whether the device exposes more than one camera (after permission). */
  async hasMultipleCameras(): Promise<boolean> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'videoinput').length > 1;
    } catch {
      return true;
    }
  }

  /**
   * Swapping srcObject on a playing <video> makes Safari reject the pending
   * play() with AbortError even though the new stream then plays fine; wait
   * for metadata and tolerate that one case rather than failing the switch.
   */
  private async playVideo() {
    const video = this.video;
    if (!video) return;
    if (video.readyState < 1) {
      await new Promise<void>((resolve) => {
        const done = () => {
          video.removeEventListener('loadedmetadata', done);
          resolve();
        };
        video.addEventListener('loadedmetadata', done);
        setTimeout(done, 1500);
      });
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await video.play();
        return;
      } catch (err) {
        const abort = err instanceof DOMException && err.name === 'AbortError';
        if (!abort || attempt === 1) {
          if (!video.paused) return;
          throw err;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
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
    // Mirror according to the camera we actually got, not the one we asked for.
    const settings = stream.getVideoTracks()[0]?.getSettings();
    if (settings?.facingMode === 'user' || settings?.facingMode === 'environment') {
      this.facingMode = settings.facingMode;
    }
    this.mirror = this.facingMode === 'user';

    this.video.srcObject = stream;
    this.video.playsInline = true;
    this.video.muted = true;
    await this.playVideo();

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

  private async getVision(): Promise<Vision> {
    if (!this.vision) this.vision = await FilesetResolver.forVisionTasks(WASM_CDN);
    return this.vision;
  }

  private hasModel(kind: ModelKind): boolean {
    return kind === 'hand'
      ? !!this.handLandmarker
      : kind === 'face'
        ? !!this.faceLandmarker
        : !!this.poseLandmarker;
  }

  /** Loads one tracker on demand (GPU, falling back to CPU); idempotent. */
  private ensureModel(kind: ModelKind): Promise<void> {
    if (this.hasModel(kind) || this.destroyed) return Promise.resolve();
    const pending = this.modelLoading[kind];
    if (pending) return pending;
    const task = (async () => {
      const vision = await this.getVision();
      const create = (delegate: 'GPU' | 'CPU') => {
        if (kind === 'hand') {
          return HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: HAND_MODEL, delegate },
            runningMode: 'VIDEO',
            numHands: 2,
          });
        }
        if (kind === 'face') {
          return FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: FACE_MODEL, delegate },
            runningMode: 'VIDEO',
            numFaces: 1,
          });
        }
        return PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: POSE_MODEL, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
      };
      let model: HandLandmarker | FaceLandmarker | PoseLandmarker;
      try {
        model = await create('GPU');
      } catch {
        model = await create('CPU');
      }
      if (this.destroyed) {
        model.close();
        return;
      }
      if (model instanceof HandLandmarker) this.handLandmarker = model;
      else if (model instanceof FaceLandmarker) this.faceLandmarker = model;
      else this.poseLandmarker = model;
    })().finally(() => {
      delete this.modelLoading[kind];
    });
    this.modelLoading[kind] = task;
    // Pose is an enhancement; hand/face failures surface through the first
    // product's await in init(), later ones just keep the product untracked.
    return kind === 'pose' ? task.catch(() => {}) : task;
  }

  /** Makes sure the product's trackers exist; reports while they download. */
  private modelsReady(type: ProductType): boolean {
    const required = MODELS_FOR[type].filter((k) => k !== 'pose');
    const ready = required.every((k) => this.hasModel(k));
    if (!ready) for (const k of required) void this.ensureModel(k).catch(() => {});
    if (!ready !== this.modelLoadingNotified) {
      this.modelLoadingNotified = !ready;
      this.callbacks.onModelLoading?.(!ready);
    }
    return ready;
  }

  /**
   * @param everyFrame the necklace is anchored to the shoulders, so it needs a
   *   fresh skeleton each frame; reusing every other result made it step.
   */
  private detectPose(ts: number, everyFrame = false): NormalizedLandmark[] | null {
    if (!this.poseLandmarker || !this.video) return null;
    if (everyFrame || this.poseFrame++ % 2 === 0) {
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
    this.resetRing();
    this.resetNeck();
    this.resetGlasses();
    this.resetWatch();
  }

  private resetRing() {
    this.ringPose.reset();
    this.handAnchor = null;
  }

  private resetNeck() {
    this.neckPose.reset();
    this.neckRadiusRatio.reset();
    this.shoulderFilter.reset();
    this.chinRatio = null;
    this.shoulderWeight = 0;
    this.lastShoulders = null;
  }

  private resetGlasses() {
    this.glassesPose.reset();
    this.glassesYaw.reset();
  }

  private resetWatch() {
    this.watchPose.reset();
    this.handAnchor = null;
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
    this.acquiredFrames = 0;

    const loaded = await this.getImage(product.image);
    // A newer selection arrived while this image was loading.
    if (this.activeProduct !== product) return;
    for (const kind of MODELS_FOR[product.type]) void this.ensureModel(kind);
    switch (product.type) {
      case 'necklace': {
        const pendant = NECKLACE_STYLES[product.id]?.pendant;
        this.pendantAsset = pendant ? await this.getImage(pendant.src) : null;
        if (this.activeProduct !== product) return;
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
    this.watchVideoFrames();
    this.loop();
  }

  /**
   * requestVideoFrameCallback fires once per decoded camera frame. Running the
   * trackers only then (instead of on every screen refresh) stops the same
   * frame being processed twice on 60/120 Hz screens, which wasted GPU time
   * and fed duplicate samples into the smoothing.
   */
  private watchVideoFrames() {
    type RvfcVideo = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    const video = this.video as RvfcVideo | null;
    if (!video?.requestVideoFrameCallback) return;
    this.usesVideoFrameCallback = true;
    const onFrame = () => {
      if (!this.running || this.destroyed) return;
      this.videoFrameReady = true;
      (this.video as RvfcVideo | null)?.requestVideoFrameCallback?.(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  }

  private hasNewVideoFrame(): boolean {
    if (!this.video) return false;
    if (this.usesVideoFrameCallback) {
      const now = performance.now();
      // Safety net: if the callback chain ever stalls (e.g. across a camera
      // switch on some browsers), keep processing rather than freezing.
      const ready = this.videoFrameReady || now - this.lastProcessedAt > 250;
      this.videoFrameReady = false;
      if (ready) this.lastProcessedAt = now;
      return ready;
    }
    const t = this.video.currentTime;
    if (t === this.lastVideoTime) return false;
    this.lastVideoTime = t;
    return true;
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

  /**
   * MediaPipe requires strictly increasing timestamps per landmarker for the
   * life of the page. video.currentTime restarts at 0 on a camera switch, so
   * use the wall clock instead.
   */
  private nextTimestamp(): number {
    const t = Math.max(performance.now(), this.lastTimestamp + 1);
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

    // No frame yet (e.g. mid camera switch); detectForVideo would throw.
    if (!product || this.video.readyState < 2) {
      this.overlayCtx.clearRect(0, 0, vw, vh);
      return;
    }
    // Same camera frame as last time: keep the current overlay on screen.
    if (!this.hasNewVideoFrame()) return;

    // Back cameras often change resolution or orientation a moment after
    // starting (or when the phone rotates). The overlay must always have the
    // video's exact size, otherwise it is cropped differently from the picture
    // underneath and products drift sideways.
    const { videoWidth, videoHeight } = this.video;
    if (
      videoWidth > 0 &&
      (this.overlayCanvas.width !== videoWidth || this.overlayCanvas.height !== videoHeight)
    ) {
      this.overlayCanvas.width = videoWidth;
      this.overlayCanvas.height = videoHeight;
      this.resetSmoothing();
      this.lastDraw = null;
      return;
    }

    this.frameCount++;
    if (now - this.lastFrameTime >= 1000) {
      this.callbacks.onFps?.(Math.round((this.frameCount * 1000) / (now - this.lastFrameTime)));
      this.frameCount = 0;
      this.lastFrameTime = now;
    }

    this.overlayCtx.clearRect(0, 0, vw, vh);
    if (!this.modelsReady(product.type)) return;

    const ts = this.nextTimestamp();
    this.frameTime = now / 1000;
    let detected = false;
    // True when the target was just re-acquired after a real loss.
    const fresh = this.lostFrames >= RESET_AFTER_LOST_FRAMES;

    switch (product.type) {
      case 'glasses': {
        if (!this.faceLandmarker) break;
        const res = this.faceLandmarker.detectForVideo(this.video, ts);
        if (res.faceLandmarks.length > 0) {
          detected = true;
          if (fresh) this.resetGlasses();
          if (this.glassesAsset) this.drawGlasses(res, vw, vh);
        }
        break;
      }
      case 'necklace': {
        const pose = this.detectPose(ts, true);
        const face = this.faceLandmarker?.detectForVideo(this.video, ts);
        const target = this.neckFrame(pose, face?.faceLandmarks[0], vw, vh);
        if (target) {
          detected = true;
          if (fresh) {
            this.neckPose.reset();
            this.neckRadiusRatio.reset();
          }
          this.drawNecklace(target);
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
            this.resetRing();
            this.resetWatch();
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
      // Only show the product once the target has been seen for a few frames
      // in a row, so false detections at the frame edge do not flash it.
      if (this.acquiredFrames < ACQUIRE_FRAMES) {
        this.acquiredFrames++;
        if (this.acquiredFrames < ACQUIRE_FRAMES) {
          this.overlayCtx.clearRect(0, 0, vw, vh);
          tracking = false;
        }
      }
    } else {
      this.lostFrames++;
      if (this.lostFrames <= HOLD_FRAMES && this.lastDraw && this.acquiredFrames >= ACQUIRE_FRAMES) {
        this.lastDraw();
        tracking = true;
      } else {
        this.lastDraw = null;
        if (this.lostFrames > HOLD_FRAMES) this.acquiredFrames = 0;
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
    scaleY = 1,
    scaleX = 1,
  ) {
    this.lastDraw = () =>
      this.paintImage(asset, x, y, width, angle, anchorX, anchorY, flipV, scaleY, scaleX);
    this.paintImage(asset, x, y, width, angle, anchorX, anchorY, flipV, scaleY, scaleX);
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
    scaleY: number,
    scaleX = 1,
  ) {
    if (!this.overlayCtx) return;
    const height = width / asset.aspect;
    this.overlayCtx.save();
    this.overlayCtx.translate(x, y);
    this.overlayCtx.rotate(angle);
    // Soft contact shadow so the product sits on the skin instead of floating.
    this.overlayCtx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    this.overlayCtx.shadowBlur = Math.min(10, Math.max(3, width * 0.025));
    this.overlayCtx.shadowOffsetY = Math.min(4, Math.max(1, width * 0.01));
    this.overlayCtx.scale(scaleX, flipV ? -scaleY : scaleY);
    this.overlayCtx.drawImage(
      asset.image,
      -width * anchorX,
      -height * anchorY,
      width,
      height,
    );
    this.overlayCtx.restore();
  }

  /** 3D distance in pixels; MediaPipe z is in the same units as x. */
  private dist3(a: NormalizedLandmark, b: NormalizedLandmark, w: number, h: number) {
    return Math.hypot((a.x - b.x) * w, (a.y - b.y) * h, (a.z - b.z) * w);
  }

  /**
   * Neck axis at the collar line, neck radius and scene scale (px/cm). The
   * face gives the most reliable scale and neck width; pose shoulders give
   * the collar height and tilt; either alone still works.
   *
   * Stability measures:
   * - face width is measured in 3D, so turning the head does not shrink the
   *   necklace (it sits on the body, which did not move);
   * - the chin is estimated from the rigid upper face, because the chin
   *   landmark drops whenever the mouth opens (the necklace bounced on speech);
   * - the shoulder line is filtered on its own and faded in/out instead of
   *   switching, so pose visibility flicker does not make the chain jump;
   * - the chest follows head roll only partly.
   */
  private neckFrame(
    pose: NormalizedLandmark[] | null,
    face: NormalizedLandmark[] | undefined,
    w: number,
    h: number,
  ): NeckFrame | null {
    const T = NECKLACE_TUNING;
    const t = this.frameTime;
    const dt = Math.min(0.2, Math.max(0, t - this.lastNeckTime));
    this.lastNeckTime = t;

    let shoulders: { mid: Pt; span: number; angle: number } | null = null;
    const ls = pose?.[POSE.leftShoulder];
    const rs = pose?.[POSE.rightShoulder];
    const minVis = this.shoulderWeight > 0.05 ? 0.35 : POSE_MIN_VISIBILITY;
    if (ls && rs && (ls.visibility ?? 1) >= minVis && (rs.visibility ?? 1) >= minVis) {
      const a = this.toScreen(ls.x, ls.y, w, h);
      const b = this.toScreen(rs.x, rs.y, w, h);
      const [l, r] = a.x <= b.x ? [a, b] : [b, a];
      const span = Math.hypot(r.x - l.x, r.y - l.y);
      if (span > w * 0.05) {
        if (this.shoulderWeight < 0.01) this.shoulderFilter.reset();
        const f = this.shoulderFilter.update(
          {
            x: (l.x + r.x) / 2,
            y: (l.y + r.y) / 2,
            scale: span,
            angle: Math.atan2(r.y - l.y, r.x - l.x),
          },
          t,
          span,
        );
        shoulders = { mid: { x: f.x, y: f.y }, span: f.scale, angle: f.angle };
        this.lastShoulders = shoulders;
      }
    }
    const targetWeight = shoulders ? 0.5 : 0;
    this.shoulderWeight += (targetWeight - this.shoulderWeight) * Math.min(1, dt * 5);
    const sh = shoulders ?? (this.shoulderWeight > 0.01 ? this.lastShoulders : null);

    let faceInfo: { chin: Pt; width: number; angle: number } | null = null;
    if (face) {
      const a = this.toScreen(face[234].x, face[234].y, w, h);
      const b = this.toScreen(face[454].x, face[454].y, w, h);
      const [l, r] = a.x <= b.x ? [a, b] : [b, a];
      const width = this.dist3(face[234], face[454], w, h);
      if (width > w * 0.03) {
        const forehead = this.toScreen(face[10].x, face[10].y, w, h);
        const bridge = this.toScreen(face[168].x, face[168].y, w, h);
        const chin = this.toScreen(face[152].x, face[152].y, w, h);
        const upX = bridge.x - forehead.x;
        const upY = bridge.y - forehead.y;
        const upLen = Math.hypot(upX, upY) || 1;
        const observed = Math.min(
          2.8,
          Math.max(1.3, Math.hypot(chin.x - bridge.x, chin.y - bridge.y) / upLen),
        );
        const mouthOpen = this.dist3(face[13], face[14], w, h) / width;
        if (this.chinRatio === null) this.chinRatio = observed;
        else if (mouthOpen < 0.035) this.chinRatio += (observed - this.chinRatio) * 0.05;
        else if (observed < this.chinRatio) this.chinRatio = observed;
        faceInfo = {
          chin: { x: bridge.x + upX * this.chinRatio, y: bridge.y + upY * this.chinRatio },
          width,
          angle: Math.atan2(r.y - l.y, r.x - l.x),
        };
      }
    }
    if (!sh && !faceInfo) return null;

    const sw = faceInfo ? this.shoulderWeight : 1;
    const angle = sh
      ? faceInfo
        ? sh.angle * (sw / 0.5) + faceInfo.angle * 0.35 * (1 - sw / 0.5)
        : sh.angle
      : faceInfo!.angle * 0.35;
    const down = { x: -Math.sin(angle), y: Math.cos(angle) };

    let pxPerCm: number;
    let radiusPx: number;
    let x: number;
    let y: number;
    if (faceInfo) {
      pxPerCm = faceInfo.width / T.faceWidthCm;
      radiusPx = faceInfo.width * T.neckRadiusToFace;
      const drop = faceInfo.width * T.neckBaseFromChin;
      x = faceInfo.chin.x + down.x * drop;
      y = faceInfo.chin.y + down.y * drop;
      if (sh && sw > 0) {
        // Shoulders know where the collar line is; blend the two estimates.
        const lift = sh.span * T.neckLiftFromShoulders;
        const sx = sh.mid.x - down.x * lift;
        const sy = sh.mid.y - down.y * lift;
        x = x * (1 - sw) + sx * sw;
        y = y * (1 - sw) + sy * sw;
      }
    } else {
      const s2 = sh!;
      pxPerCm = s2.span / T.shoulderSpanCm;
      radiusPx = s2.span * T.neckRadiusToShoulders;
      const lift = s2.span * T.neckLiftFromShoulders;
      x = s2.mid.x - down.x * lift;
      y = s2.mid.y - down.y * lift;
    }
    return { x, y, radiusPx, pxPerCm, angle };
  }

  private drawNecklace(target: NeckFrame) {
    if (!this.overlayCtx || !this.activeProduct) return;
    const style = NECKLACE_STYLES[this.activeProduct.id];
    if (!style) return;
    const t = this.frameTime;
    const pose = this.neckPose.update(
      { x: target.x, y: target.y, scale: target.pxPerCm, angle: target.angle },
      t,
      target.pxPerCm * NECKLACE_TUNING.faceWidthCm,
    );
    const ratio = this.neckRadiusRatio.update(target.radiusPx / target.pxPerCm, t);
    const frame: NeckFrame = {
      x: pose.x,
      y: pose.y,
      radiusPx: ratio * pose.scale,
      pxPerCm: pose.scale,
      angle: pose.angle,
    };
    const ctx = this.overlayCtx;
    const pendant = this.pendantAsset;
    const draw = () => renderNecklace(ctx, style, frame, pendant);
    this.lastDraw = draw;
    draw();
  }

  private drawRing(
    result: ReturnType<HandLandmarker['detectForVideo']>,
    w: number,
    h: number,
  ) {
    if (!this.ringAsset || !this.activeProduct) return;

    const bestIndex = this.pickHand(result.landmarks, w, h, 13);
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

    const palmPx = pxPerMeter ? pxPerMeter * 0.09 : sizing.palmScale;
    const pose = this.ringPose.update(
      { x: centerX, y: centerY, scale: ringWidth, angle },
      this.frameTime,
      palmPx,
    );

    if (this.debug && this.overlayCtx) {
      const c = this.overlayCtx;
      c.save();
      for (const i of [9, 10, 13, 14, 15, 16]) {
        const pt = this.toScreen(bestHand[i].x, bestHand[i].y, w, h);
        c.fillStyle = i === 13 || i === 14 ? '#ff00ff' : '#00e5ff';
        c.fillRect(pt.x - 4, pt.y - 4, 8, 8);
      }
      c.fillStyle = '#fff';
      c.font = '16px monospace';
      c.fillText(
        `${this.facingMode} mirror:${this.mirror} canvas:${w}x${h} video:${this.video?.videoWidth}x${this.video?.videoHeight}`,
        12,
        h - 16,
      );
      c.restore();
    }

    const asset = this.ringAsset;
    const anchorY = tuning.anchorY;
    const visible = pose.scale * tuning.bandRatio;
    const draw = () =>
      this.paintRingWrapped(asset, pose.x, pose.y, pose.scale, pose.angle, anchorY, visible);
    this.lastDraw = draw;
    draw();
  }

  /**
   * A ring seen from above only shows the band across the width of the finger;
   * beyond that it curves round the sides out of sight. Fade and shade the band
   * there instead of letting the flat product shot stick out past the finger.
   */
  private paintRingWrapped(
    asset: LoadedImage,
    x: number,
    y: number,
    width: number,
    angle: number,
    anchorY: number,
    visibleWidth: number,
  ) {
    if (!this.overlayCtx || width < 2) return;
    const height = width / asset.aspect;
    const cw = Math.ceil(width);
    const ch = Math.ceil(height);
    const off = (this.ringCanvas ??= document.createElement('canvas'));
    if (off.width !== cw || off.height !== ch) {
      off.width = cw;
      off.height = ch;
    }
    const octx = off.getContext('2d');
    if (!octx) return;

    octx.globalCompositeOperation = 'source-over';
    octx.clearRect(0, 0, cw, ch);
    octx.drawImage(asset.image, 0, 0, width, height);

    const cx = width / 2;
    const half = visibleWidth / 2;
    const stop = (v: number) => Math.min(1, Math.max(0, v / width));
    const solid = half * 0.72;
    const edge = half * 0.98;

    const alpha = octx.createLinearGradient(0, 0, width, 0);
    alpha.addColorStop(stop(cx - edge), 'rgba(0,0,0,0)');
    alpha.addColorStop(stop(cx - solid), 'rgba(0,0,0,1)');
    alpha.addColorStop(stop(cx + solid), 'rgba(0,0,0,1)');
    alpha.addColorStop(stop(cx + edge), 'rgba(0,0,0,0)');
    octx.globalCompositeOperation = 'destination-in';
    octx.fillStyle = alpha;
    octx.fillRect(0, 0, cw, ch);

    const shade = octx.createLinearGradient(0, 0, width, 0);
    shade.addColorStop(stop(cx - edge), 'rgba(0,0,0,0.55)');
    shade.addColorStop(stop(cx - solid), 'rgba(0,0,0,0)');
    shade.addColorStop(stop(cx + solid), 'rgba(0,0,0,0)');
    shade.addColorStop(stop(cx + edge), 'rgba(0,0,0,0.55)');
    octx.globalCompositeOperation = 'source-atop';
    octx.fillStyle = shade;
    octx.fillRect(0, 0, cw, ch);
    octx.globalCompositeOperation = 'source-over';

    const ctx = this.overlayCtx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = Math.min(8, Math.max(2, width * 0.03));
    ctx.shadowOffsetY = Math.min(3, Math.max(1, width * 0.012));
    ctx.drawImage(off, -width / 2, -height * anchorY);
    ctx.restore();
  }

  private drawGlasses(
    result: ReturnType<FaceLandmarker['detectForVideo']>,
    w: number,
    h: number,
  ) {
    if (!this.glassesAsset || !this.activeProduct) return;

    const lm = result.faceLandmarks[0];
    // Eye corners and the nose bridge are rigid. The eyelid points used before
    // (159/386) move on every blink, which made the frames twitch.
    const lOut = lm[33];
    const rOut = lm[263];
    const lIn = lm[133];
    const rIn = lm[362];
    const lOutPt = this.toScreen(lOut.x, lOut.y, w, h);
    const rOutPt = this.toScreen(rOut.x, rOut.y, w, h);
    const lInPt = this.toScreen(lIn.x, lIn.y, w, h);
    const rInPt = this.toScreen(rIn.x, rIn.y, w, h);
    const bridgePt = this.toScreen(lm[168].x, lm[168].y, w, h);
    const foreheadPt = this.toScreen(lm[10].x, lm[10].y, w, h);

    // True eye spans in 3D: turning the head no longer shrinks the frames, and
    // there is no more switching between two different size estimates.
    const outer3 = this.dist3(lOut, rOut, w, h);
    const inner3 = this.dist3(lIn, rIn, w, h);
    const tuning = GLASSES_TUNING[this.activeProduct.id] ?? DEFAULT_GLASSES_TUNING;
    const width = (outer3 * 1.75 + inner3 * 0.1) * tuning.widthFactor;

    const ax = rOutPt.x - lOutPt.x;
    const ay = rOutPt.y - lOutPt.y;
    const aLen = Math.hypot(ax, ay) || 1;
    const axis = { x: ax / aLen, y: ay / aLen };
    const angle = Math.atan2(ay, ax);

    const mid = {
      x: (lOutPt.x + rOutPt.x + lInPt.x + rInPt.x) / 4,
      y: (lOutPt.y + rOutPt.y + lInPt.y + rInPt.y) / 4,
    };
    let up = { x: axis.y, y: -axis.x };
    if ((foreheadPt.x - mid.x) * up.x + (foreheadPt.y - mid.y) * up.y < 0) {
      up = { x: -up.x, y: -up.y };
    }
    // Frames sit in front of the eyes, so follow the bridge sideways when the
    // head turns; lift to the eyelid height the product art was tuned for.
    const along = (bridgePt.x - mid.x) * axis.x + (bridgePt.y - mid.y) * axis.y;
    const lift = width * 0.031;
    const pose = this.glassesPose.update(
      {
        x: mid.x + axis.x * along * 0.6 + up.x * lift,
        y: mid.y + axis.y * along * 0.6 + up.y * lift,
        scale: width,
        angle,
      },
      this.frameTime,
      width,
    );

    // A flat frame front narrows as the head turns, like real glasses.
    const dz = (rOut.z - lOut.z) * w;
    const yaw = this.glassesYaw.update(Math.atan2(Math.abs(dz), aLen), this.frameTime);
    const squash = Math.max(0.62, Math.cos(yaw));

    this.drawImageAt(
      this.glassesAsset,
      pose.x,
      pose.y,
      pose.scale,
      pose.angle,
      tuning.anchorX,
      tuning.anchorY,
      this.mirror,
      1,
      squash,
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
   * Stay on the hand already being tracked. Re-picking the "best" hand every
   * frame made the product jump between hands when both were in view.
   */
  private pickHand(hands: NormalizedLandmark[][], w: number, h: number, anchorIdx: number) {
    let idx = 0;
    if (hands.length > 1) {
      if (this.handAnchor) {
        let best = Infinity;
        hands.forEach((hand, i) => {
          const p = this.toScreen(hand[anchorIdx].x, hand[anchorIdx].y, w, h);
          const d = Math.hypot(p.x - this.handAnchor!.x, p.y - this.handAnchor!.y);
          if (d < best) {
            best = d;
            idx = i;
          }
        });
      } else {
        let best = -1;
        hands.forEach((hand, i) => {
          const size = Math.hypot(hand[9].x - hand[0].x, hand[9].y - hand[0].y);
          if (size > best) {
            best = size;
            idx = i;
          }
        });
      }
    }
    const a = hands[idx][anchorIdx];
    this.handAnchor = this.toScreen(a.x, a.y, w, h);
    return idx;
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
      // Include landmark depth (same units as x): bones pointing at the camera
      // then no longer read as short, so tilting the hand stops shrinking it.
      const px = this.dist3(hand[a], hand[b], w, h);
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

    const bestIndex = this.pickHand(result.landmarks, w, h, 0);
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

    const armAxis = this.watchArmDir.update(target.x, target.y, this.frameTime);

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
        this.watchPose.resetAngle();
      }
    }
    const angle = crownToHand + this.watchFlip;

    const fit = this.watchPose.update(
      { x: watchX, y: watchY, scale: watchWidth, angle },
      this.frameTime,
      palmLen,
    );
    const smoothCase = fit.scale * this.watchGeometry.caseWidthFrac;

    this.drawWatchWrapped(
      this.watchAsset,
      fit.x,
      fit.y,
      fit.scale,
      fit.angle,
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
