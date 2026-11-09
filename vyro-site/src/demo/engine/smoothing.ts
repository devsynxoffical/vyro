/**
 * Exponential smoothing with an optional adaptive rate: when `max` is given the
 * rate rises with the size of the change (a one-euro style filter), so slow
 * drift is damped while fast movement is followed without lag.
 */
export interface SmoothOptions {
  /** Highest rate to use for large changes */
  max?: number;
  /** Change size at which the rate has risen by 1 (units of the value) */
  scale?: number;
  /** Changes below this are treated as jitter and smoothed at the base rate */
  dead?: number;
}

function rateFor(base: number, change: number, opts: SmoothOptions): number {
  if (opts.max === undefined || !opts.scale) return base;
  const beyond = Math.max(0, change - (opts.dead ?? 0));
  return Math.min(opts.max, base + beyond / opts.scale);
}

/**
 * The adaptive rate is driven by a low-passed *signed* gap between target and
 * value, not the raw per-frame change: landmark jitter alternates sign and
 * cancels, while genuine movement keeps the same sign and builds up.
 */
const TREND_RATE = 0.35;

export class SmoothPoint {
  private x = 0;
  private y = 0;
  private tx = 0;
  private ty = 0;
  private initialized = false;

  constructor(
    private alpha = 0.35,
    private opts: SmoothOptions = {},
  ) {}

  update(targetX: number, targetY: number): { x: number; y: number } {
    if (!this.initialized) {
      this.x = targetX;
      this.y = targetY;
      this.tx = 0;
      this.ty = 0;
      this.initialized = true;
      return { x: this.x, y: this.y };
    }

    this.tx += (targetX - this.x - this.tx) * TREND_RATE;
    this.ty += (targetY - this.y - this.ty) * TREND_RATE;
    const a = rateFor(this.alpha, Math.hypot(this.tx, this.ty), this.opts);
    this.x += (targetX - this.x) * a;
    this.y += (targetY - this.y) * a;
    return { x: this.x, y: this.y };
  }

  reset() {
    this.initialized = false;
  }
}

export class SmoothValue {
  private value = 0;
  private trend = 0;
  private initialized = false;

  constructor(
    private alpha = 0.3,
    private opts: SmoothOptions = {},
  ) {}

  update(target: number): number {
    if (!this.initialized) {
      this.value = target;
      this.trend = 0;
      this.initialized = true;
      return this.value;
    }

    // Scale is relative to the value itself so it works for any pixel size.
    const rel = (target - this.value) / (Math.abs(this.value) || 1);
    this.trend += (rel - this.trend) * TREND_RATE;
    this.value += (target - this.value) * rateFor(this.alpha, Math.abs(this.trend), this.opts);
    return this.value;
  }

  reset() {
    this.initialized = false;
  }
}

export class SmoothAngle {
  private value = 0;
  private trend = 0;
  private initialized = false;

  constructor(
    private alpha = 0.3,
    private opts: SmoothOptions = {},
  ) {}

  update(target: number): number {
    if (!this.initialized) {
      this.value = target;
      this.trend = 0;
      this.initialized = true;
      return this.value;
    }

    let diff = target - this.value;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    this.trend += (diff - this.trend) * TREND_RATE;
    this.value += diff * rateFor(this.alpha, Math.abs(this.trend), this.opts);
    return this.value;
  }

  reset() {
    this.initialized = false;
  }
}

// ---------------------------------------------------------------------------
// Time-based adaptive filtering (One Euro, Casiez et al. CHI 2012). Unlike the
// per-frame filters above, behaviour is identical at 30, 60 or 120 fps.
// ---------------------------------------------------------------------------

class LowPass {
  private y = 0;
  private initialized = false;

  filter(x: number, alpha: number): number {
    if (!this.initialized) {
      this.y = x;
      this.initialized = true;
      return x;
    }
    this.y += alpha * (x - this.y);
    return this.y;
  }

  get value() {
    return this.y;
  }

  get ready() {
    return this.initialized;
  }

  reset() {
    this.initialized = false;
  }
}

function smoothingFactor(dt: number, cutoff: number): number {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);
}

export interface OneEuroParams {
  /** Cutoff frequency (Hz) when the signal is at rest. Lower = steadier. */
  minCutoff: number;
  /** How quickly the cutoff opens up with speed. Higher = less lag on motion. */
  beta: number;
  /** Cutoff (Hz) for the derivative estimate. */
  dCutoff?: number;
}

export class OneEuroFilter {
  private x = new LowPass();
  private dx = new LowPass();
  private lastT = -1;
  private params: Required<OneEuroParams>;

  constructor(params: OneEuroParams) {
    this.params = { dCutoff: 1.0, ...params };
  }

  /**
   * @param value raw sample
   * @param t timestamp in seconds
   * @param speedScale divides the derivative before it drives the cutoff, so
   *   speed can be expressed in "object sizes per second" and the same tuning
   *   works whether the object is near or far from the camera.
   */
  filter(value: number, t: number, speedScale = 1): number {
    if (!this.x.ready || this.lastT < 0) {
      this.lastT = t;
      this.dx.filter(0, 1);
      return this.x.filter(value, 1);
    }

    let dt = t - this.lastT;
    this.lastT = t;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.25);

    const rawSpeed = (value - this.x.value) / dt;
    const speed = this.dx.filter(rawSpeed, smoothingFactor(dt, this.params.dCutoff));
    const norm = Math.abs(speed) / (speedScale || 1);
    const cutoff = this.params.minCutoff + this.params.beta * norm;
    return this.x.filter(value, smoothingFactor(dt, cutoff));
  }

  get value() {
    return this.x.value;
  }

  reset() {
    this.x.reset();
    this.dx.reset();
    this.lastT = -1;
  }
}

export interface Pose2D {
  x: number;
  y: number;
  /** Rendered width in pixels. */
  scale: number;
  /** Rotation in radians. */
  angle: number;
}

export interface PoseFilterParams {
  position: OneEuroParams;
  scale: OneEuroParams;
  angle: OneEuroParams;
  /** Max relative change of the scale target per frame (outlier gate). */
  maxScaleStep?: number;
  /** Relative scale changes below this are treated as noise and ignored. */
  scaleDeadband?: number;
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Filters a full 2D overlay pose. Scale is filtered in log space (so growth and
 * shrink are symmetric), outlier-gated, and has a small dead-band so a product
 * held still does not "breathe" in size.
 */
export class PoseFilter {
  private px: OneEuroFilter;
  private py: OneEuroFilter;
  private ps: OneEuroFilter;
  private pa: OneEuroFilter;
  private params: PoseFilterParams;

  private unwrappedAngle = 0;
  private lastRawAngle = 0;
  private gatedLogScale = 0;
  private hasPose = false;
  private hasAngle = false;

  constructor(params: PoseFilterParams) {
    this.params = params;
    this.px = new OneEuroFilter(params.position);
    this.py = new OneEuroFilter(params.position);
    this.ps = new OneEuroFilter(params.scale);
    this.pa = new OneEuroFilter(params.angle);
  }

  update(raw: Pose2D, t: number, refSize = raw.scale): Pose2D {
    const logScale = Math.log(Math.max(raw.scale, 1e-3));

    if (!this.hasAngle) {
      this.hasAngle = true;
      this.unwrappedAngle = raw.angle;
      this.lastRawAngle = raw.angle;
    } else {
      this.unwrappedAngle += wrapAngle(raw.angle - this.lastRawAngle);
      this.lastRawAngle = raw.angle;
    }

    if (!this.hasPose) {
      this.hasPose = true;
      this.gatedLogScale = logScale;
    } else {

      const maxStep = Math.log(1 + (this.params.maxScaleStep ?? 0.06));
      const deadband = Math.log(1 + (this.params.scaleDeadband ?? 0.012));
      const prev = this.ps.value;
      let delta = logScale - prev;
      if (Math.abs(delta) < deadband) {
        delta = 0;
      } else {
        delta -= Math.sign(delta) * deadband;
      }
      delta = Math.max(-maxStep, Math.min(maxStep, delta));
      this.gatedLogScale = prev + delta;
    }

    const ref = Math.max(refSize, 1);
    const x = this.px.filter(raw.x, t, ref);
    const y = this.py.filter(raw.y, t, ref);
    const scale = Math.exp(this.ps.filter(this.gatedLogScale, t));
    const angle = this.pa.filter(this.unwrappedAngle, t);

    return { x, y, scale, angle };
  }

  /** Snap the rotation to the next sample instead of spinning towards it. */
  resetAngle() {
    this.pa.reset();
    this.hasAngle = false;
  }

  reset() {
    this.px.reset();
    this.py.reset();
    this.ps.reset();
    this.pa.reset();
    this.hasPose = false;
    this.hasAngle = false;
  }
}

/** Simple adaptive scalar filter (used for auxiliary signals like yaw). */
export class SmoothScalar {
  private f: OneEuroFilter;

  constructor(params: OneEuroParams) {
    this.f = new OneEuroFilter(params);
  }

  update(value: number, t: number, speedScale = 1): number {
    return this.f.filter(value, t, speedScale);
  }

  reset() {
    this.f.reset();
  }
}

/** Adaptive filter for a 2D unit direction vector. */
export class SmoothDirection {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;

  constructor(params: OneEuroParams) {
    this.fx = new OneEuroFilter(params);
    this.fy = new OneEuroFilter(params);
  }

  update(x: number, y: number, t: number): { x: number; y: number } {
    const sx = this.fx.filter(x, t);
    const sy = this.fy.filter(y, t);
    const len = Math.hypot(sx, sy) || 1;
    return { x: sx / len, y: sy / len };
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
  }
}
