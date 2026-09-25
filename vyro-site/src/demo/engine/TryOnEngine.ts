import {
  FaceLandmarker,
  HandLandmarker,
  FilesetResolver,
} from '@mediapipe/tasks-vision';
import { PRODUCTS, type Product } from '../types';
import { estimateFingerSize } from './fingerSizing';
import { NECKLACE_ASSET, computeNecklacePlacement } from './necklacePlacement';
import { SmoothAngle, SmoothPoint, SmoothValue } from './smoothing';

const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

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

const GLASSES_TUNING: Record<
  string,
  { widthFactor: number; anchorX: number; anchorY: number }
> = {
  'glasses-1': { widthFactor: 1.0, anchorX: 0.5, anchorY: 0.405 },
};

const DEFAULT_GLASSES_TUNING = { widthFactor: 1.0, anchorX: 0.5, anchorY: 0.405 };

const WATCH_TUNING = {
  wristTaper: 0.73,
  caseImageFill: 0.88,
  forearmOffset: 0.06,
  anchorY: 0.44,
};

export class TryOnEngine {
  private video: HTMLVideoElement | null = null;
  private overlayCanvas: HTMLCanvasElement | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;

  private handLandmarker: HandLandmarker | null = null;
  private faceLandmarker: FaceLandmarker | null = null;

  private ringAsset: LoadedImage | null = null;
  private necklaceAsset: LoadedImage | null = null;
  private glassesAsset: LoadedImage | null = null;
  private watchAsset: LoadedImage | null = null;
  private imageCache = new Map<string, LoadedImage>();

  private animationId = 0;
  private running = false;
  private activeProduct: Product | null = null;
  private facingMode: CameraFacing = 'user';
  private mirror = true;
  private lastTimestamp = -1;

  private ringCenter = new SmoothPoint(0.28);
  private ringScale = new SmoothValue(0.28);
  private ringRotation = new SmoothAngle(0.22);

  private neckCenter = new SmoothPoint(0.4);
  private neckScale = new SmoothValue(0.35);
  private neckRotation = new SmoothAngle(0.3);

  private glassesCenter = new SmoothPoint(0.4);
  private glassesScale = new SmoothValue(0.35);
  private glassesRotation = new SmoothAngle(0.3);

  private watchCenter = new SmoothPoint(0.16);
  private watchScale = new SmoothValue(0.18);
  private watchRotation = new SmoothAngle(0.14);
  private watchArmDir = new SmoothPoint(0.12);

  private wristTrail: { x: number; y: number }[] = [];
  private lockedArmDir: { x: number; y: number } | null = null;
  private armLockStrength = 0;
  private armStableFrames = 0;
  private lastWatchAngle = 0;

  private lastFrameTime = 0;
  private frameCount = 0;
  private lastTracking = false;
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

    if (this.video?.srcObject) {
      const stream = this.video.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
    }

    this.callbacks.onStatus('loading', 'Switching camera...');
    await this.initCamera();
    this.callbacks.onStatus('ready');
  }

  private async initCamera() {
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
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: this.facingMode },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
        audio: false,
      });
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          throw new Error('Camera permission denied. Allow camera access in your browser.');
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

    const track = stream.getVideoTracks()[0];
    if (track) {
      console.log('Vyro Active Camera:', track.label, track.getSettings());
    }

    this.video.srcObject = stream;
    this.video.playsInline = true;
    this.video.muted = true;
    await this.video.play();

    await new Promise<void>((resolve) => {
      const check = () => {
        if (this.video && this.video.videoWidth > 0) resolve();
        else requestAnimationFrame(check);
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

  private async initMediaPipe() {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

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
    this.wristTrail = [];
    this.lockedArmDir = null;
    this.armLockStrength = 0;
    this.armStableFrames = 0;
    this.lastWatchAngle = 0;
    this.watchArmDir.reset();
  }

  private clampAngleStep(angle: number, prevAngle: number, maxStep: number): number {
    let diff = angle - prevAngle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return Math.abs(diff) <= maxStep ? angle : prevAngle + Math.sign(diff) * maxStep;
  }

  async setProduct(product: Product) {
    if (this.activeProduct?.id === product.id) return;
    this.activeProduct = product;
    this.resetSmoothing();
    this.lastTracking = false;

    const loaded = await this.getImage(product.image);
    switch (product.type) {
      case 'necklace':
        this.necklaceAsset = loaded;
        break;
      case 'glasses':
        this.glassesAsset = loaded;
        break;
      case 'ring':
        this.ringAsset = loaded;
        break;
      case 'watch':
        this.watchAsset = loaded;
        break;
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

    if (!product) return;

    const ts = this.nextTimestamp();
    let tracking = false;

    if (
      (product.type === 'necklace' || product.type === 'glasses') &&
      this.faceLandmarker
    ) {
      const res = this.faceLandmarker.detectForVideo(this.video, ts);
      if (res.faceLandmarks.length > 0) {
        tracking = true;
        if (!this.lastTracking) {
          this.neckCenter.reset();
          this.neckScale.reset();
          this.neckRotation.reset();
          this.glassesCenter.reset();
          this.glassesScale.reset();
          this.glassesRotation.reset();
        }
        if (product.type === 'necklace' && this.necklaceAsset) {
          this.drawNecklace(res, vw, vh);
        } else if (product.type === 'glasses' && this.glassesAsset) {
          this.drawGlasses(res, vw, vh);
        }
      }
    } else if (
      (product.type === 'ring' || product.type === 'watch') &&
      this.handLandmarker
    ) {
      const res = this.handLandmarker.detectForVideo(this.video, ts);
      if (res.landmarks.length > 0) {
        tracking = true;
        if (!this.lastTracking) {
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
          this.drawWatch(res, vw, vh);
        }
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

  private drawNecklace(
    result: ReturnType<FaceLandmarker['detectForVideo']>,
    w: number,
    h: number,
  ) {
    if (!this.necklaceAsset || !this.activeProduct) return;

    const lm = result.faceLandmarks[0];
    const leftJaw = lm[172];
    const rightJaw = lm[397];
    const leftCheek = lm[234];
    const rightCheek = lm[454];
    const chin = lm[152];

    const leftJawPt = this.toScreen(leftJaw.x, leftJaw.y, w, h);
    const rightJawPt = this.toScreen(rightJaw.x, rightJaw.y, w, h);
    const leftCheekPt = this.toScreen(leftCheek.x, leftCheek.y, w, h);
    const rightCheekPt = this.toScreen(rightCheek.x, rightCheek.y, w, h);
    const chinPt = this.toScreen(chin.x, chin.y, w, h);

    const cheekWidth = Math.hypot(
      rightCheekPt.x - leftCheekPt.x,
      rightCheekPt.y - leftCheekPt.y,
    );
    const jawWidth = Math.hypot(
      rightJawPt.x - leftJawPt.x,
      rightJawPt.y - leftJawPt.y,
    );
    const centerX = (leftCheekPt.x + rightCheekPt.x) / 2;

    const placement = computeNecklacePlacement(
      {
        chinY: chinPt.y,
        cheekWidth,
        jawWidth,
        assetAspect: this.necklaceAsset.aspect,
      },
      centerX,
      NECKLACE_ASSET,
    );

    const angle = Math.atan2(
      rightJawPt.y - leftJawPt.y,
      rightJawPt.x - leftJawPt.x,
    );

    const smoothPos = this.neckCenter.update(placement.centerX, placement.chestY);
    const smoothScale = this.neckScale.update(placement.scale);
    const smoothAngle = this.neckRotation.update(angle);

    this.drawImageAt(
      this.necklaceAsset,
      smoothPos.x,
      smoothPos.y,
      smoothScale,
      smoothAngle,
      0.5,
      NECKLACE_ASSET.pendantAnchorY,
      true,
    );
  }

  private drawRing(
    result: ReturnType<HandLandmarker['detectForVideo']>,
    w: number,
    h: number,
  ) {
    if (!this.ringAsset || !this.activeProduct) return;

    let bestHand = result.landmarks[0];
    let bestScore = -1;
    for (const hand of result.landmarks) {
      const ringMcp = hand[13];
      const ringPip = hand[14];
      const ringTip = hand[16];
      const score =
        Math.hypot(ringTip.x - ringMcp.x, ringTip.y - ringMcp.y) *
        Math.hypot(ringTip.x - ringPip.x, ringTip.y - ringPip.y);
      if (score > bestScore) {
        bestScore = score;
        bestHand = hand;
      }
    }

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
    const ringWidth = sizing.ringOuterWidth / tuning.bandRatio;
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
      true,
    );
  }

  private normalizeDir(x: number, y: number) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  private orientArmWithKnuckles(
    armX: number,
    armY: number,
    indexPt: { x: number; y: number },
    pinkyPt: { x: number; y: number },
  ) {
    const kx = pinkyPt.x - indexPt.x;
    const ky = pinkyPt.y - indexPt.y;
    const cross = armX * ky - armY * kx;
    if (cross < 0) return { x: -armX, y: -armY };
    return { x: armX, y: armY };
  }

  private blendArmDir(
    current: { x: number; y: number },
    target: { x: number; y: number },
    alpha: number,
  ) {
    const bx = current.x * (1 - alpha) + target.x * alpha;
    const by = current.y * (1 - alpha) + target.y * alpha;
    return this.normalizeDir(bx, by);
  }

  private computeHand3DArmAxis(
    index: { x: number; y: number; z: number },
    pinky: { x: number; y: number; z: number },
    middle: { x: number; y: number; z: number },
    wrist: { x: number; y: number; z: number },
    w: number,
    h: number,
  ): { x: number; y: number } | null {
    const zScale = w * 0.9;
    const rel = (lm: typeof wrist) => ({
      x: this.toScreen(lm.x, lm.y, w, h).x - this.toScreen(wrist.x, wrist.y, w, h).x,
      y: this.toScreen(lm.x, lm.y, w, h).y - this.toScreen(wrist.x, wrist.y, w, h).y,
      z: (lm.z - wrist.z) * zScale,
    });

    const u = rel(index);
    const f = rel(pinky);
    const m = rel(middle);

    const dx = f.x - u.x;
    const dy = f.y - u.y;
    const dz = f.z - u.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const nz = dz / len;

    const mLen = Math.hypot(m.x, m.y, m.z) || 1;
    const mx = m.x / mLen;
    const my = m.y / mLen;
    const mz = m.z / mLen;

    const cx = ny * mz - nz * my;
    const cy = nz * mx - nx * mz;
    const cz = nx * my - ny * mx;

    const fx = cy * nz - cz * ny;
    const fy = cz * nx - cx * nz;
    const fLen = Math.hypot(fx, fy);
    if (fLen < w * 0.018) return null;

    return { x: fx / fLen, y: fy / fLen };
  }

  private computeWristTrailAxis(minSpan: number): { x: number; y: number } | null {
    if (this.wristTrail.length < 5) return null;
    const first = this.wristTrail[0];
    const last = this.wristTrail[this.wristTrail.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const span = Math.hypot(dx, dy);
    if (span < minSpan) return null;
    return { x: dx / span, y: dy / span };
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
    return Math.max(knuckleSpan, projectedSpan) * WATCH_TUNING.wristTaper;
  }

  private drawWatch(
    result: ReturnType<HandLandmarker['detectForVideo']>,
    w: number,
    h: number,
  ) {
    if (!this.watchAsset) return;

    let bestHand = result.landmarks[0];
    let bestScore = -1;
    for (let i = 0; i < result.landmarks.length; i++) {
      const hand = result.landmarks[i];
      const wristLm = hand[0];
      const middleLm = hand[9];
      const score = Math.hypot(middleLm.x - wristLm.x, middleLm.y - wristLm.y);
      if (score > bestScore) {
        bestScore = score;
        bestHand = hand;
      }
    }

    const wrist = bestHand[0];
    const indexMcp = bestHand[5];
    const pinkyMcp = bestHand[17];
    const middleMcp = bestHand[9];

    const wristPt = this.toScreen(wrist.x, wrist.y, w, h);
    const indexPt = this.toScreen(indexMcp.x, indexMcp.y, w, h);
    const pinkyPt = this.toScreen(pinkyMcp.x, pinkyMcp.y, w, h);
    const knuckleSpan = Math.hypot(pinkyPt.x - indexPt.x, pinkyPt.y - indexPt.y);

    this.wristTrail.push({ x: wristPt.x, y: wristPt.y });
    if (this.wristTrail.length > 18) this.wristTrail.shift();

    const dx = pinkyPt.x - indexPt.x;
    const dy = pinkyPt.y - indexPt.y;
    const knuckleDist = Math.hypot(dx, dy) || 1;
    const isHorizontal = Math.abs(dx) > Math.abs(dy) * 1.6;

    const baseArm = this.orientArmWithKnuckles(
      -dy / knuckleDist,
      dx / knuckleDist,
      indexPt,
      pinkyPt,
    );

    let armDir: { x: number; y: number } | null = null;
    if (!isHorizontal) {
      armDir = baseArm;
    } else {
      const hand3D = this.computeHand3DArmAxis(indexMcp, pinkyMcp, middleMcp, wrist, w, h);
      if (hand3D) {
        if (Math.abs(hand3D.y) > Math.abs(hand3D.x) * 1.4) {
          // strong vertical signal
        } else {
          armDir = this.orientArmWithKnuckles(hand3D.x, hand3D.y, indexPt, pinkyPt);
        }
      }
      if (!armDir && this.armLockStrength < 0.55) {
        const trail = this.computeWristTrailAxis(knuckleSpan * 0.45);
        if (trail) {
          armDir = this.orientArmWithKnuckles(trail.x, trail.y, indexPt, pinkyPt);
        }
      }
    }

    if (armDir && this.lockedArmDir) {
      const dot = armDir.x * this.lockedArmDir.x + armDir.y * this.lockedArmDir.y;
      if (dot > 0.88) {
        this.armStableFrames++;
      } else {
        this.armStableFrames = 0;
      }
    } else if (armDir) {
      this.armStableFrames++;
    } else {
      this.armStableFrames = 0;
    }

    if (!this.lockedArmDir && armDir && this.armStableFrames >= 10) {
      this.lockedArmDir = armDir;
      this.armLockStrength = 0.65;
    } else if (
      this.lockedArmDir &&
      armDir &&
      this.armLockStrength < 1 &&
      armDir.x * this.lockedArmDir.x + armDir.y * this.lockedArmDir.y > 0.9
    ) {
      this.lockedArmDir = this.blendArmDir(this.lockedArmDir, armDir, 0.06);
      this.armLockStrength = Math.min(1, this.armLockStrength + 0.04);
    }

    let targetDirX: number;
    let targetDirY: number;
    if (this.lockedArmDir && this.armLockStrength >= 0.55) {
      targetDirX = this.lockedArmDir.x;
      targetDirY = this.lockedArmDir.y;
    } else if (armDir) {
      targetDirX = armDir.x;
      targetDirY = armDir.y;
    } else if (this.lockedArmDir) {
      targetDirX = this.lockedArmDir.x;
      targetDirY = this.lockedArmDir.y;
    } else {
      targetDirX = baseArm.x;
      targetDirY = baseArm.y;
    }

    const smoothArm = this.watchArmDir.update(targetDirX, targetDirY);
    const armAxis = this.normalizeDir(smoothArm.x, smoothArm.y);

    const wristBreadth = this.estimateWristBreadth(indexPt, pinkyPt, armAxis);
    const watchWidth = wristBreadth / WATCH_TUNING.caseImageFill;
    const watchX = wristPt.x - armAxis.x * wristBreadth * WATCH_TUNING.forearmOffset;
    const watchY = wristPt.y - armAxis.y * wristBreadth * WATCH_TUNING.forearmOffset;

    let angle = Math.atan2(armAxis.y, armAxis.x) + Math.PI / 2;
    const smoothPos = this.watchCenter.update(watchX, watchY);
    const smoothScale = this.watchScale.update(watchWidth);

    if (this.armLockStrength >= 0.55) {
      angle = this.clampAngleStep(angle, this.lastWatchAngle, 0.28);
    }
    this.lastWatchAngle = this.watchRotation.update(angle);
    const rotation = this.lastWatchAngle;

    this.drawImageAt(
      this.watchAsset,
      smoothPos.x,
      smoothPos.y,
      smoothScale,
      rotation,
      0.5,
      WATCH_TUNING.anchorY,
    );
  }

  destroy() {
    this.stop();
    if (this.video?.srcObject) {
      const stream = this.video.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
    }
    this.faceLandmarker?.close();
    this.handLandmarker?.close();
  }
}
