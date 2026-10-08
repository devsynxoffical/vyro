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
