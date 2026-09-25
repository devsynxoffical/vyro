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

export class SmoothPoint {
  private x = 0;
  private y = 0;
  private initialized = false;

  constructor(
    private alpha = 0.35,
    private opts: SmoothOptions = {},
  ) {}

  update(targetX: number, targetY: number): { x: number; y: number } {
    if (!this.initialized) {
      this.x = targetX;
      this.y = targetY;
      this.initialized = true;
      return { x: this.x, y: this.y };
    }

    const a = rateFor(this.alpha, Math.hypot(targetX - this.x, targetY - this.y), this.opts);
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
  private initialized = false;

  constructor(
    private alpha = 0.3,
    private opts: SmoothOptions = {},
  ) {}

  update(target: number): number {
    if (!this.initialized) {
      this.value = target;
      this.initialized = true;
      return this.value;
    }

    // Scale is relative to the value itself so it works for any pixel size.
    const rel = Math.abs(target - this.value) / (Math.abs(this.value) || 1);
    this.value += (target - this.value) * rateFor(this.alpha, rel, this.opts);
    return this.value;
  }

  reset() {
    this.initialized = false;
  }
}

export class SmoothAngle {
  private value = 0;
  private initialized = false;

  constructor(
    private alpha = 0.3,
    private opts: SmoothOptions = {},
  ) {}

  update(target: number): number {
    if (!this.initialized) {
      this.value = target;
      this.initialized = true;
      return this.value;
    }

    let diff = target - this.value;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    this.value += diff * rateFor(this.alpha, Math.abs(diff), this.opts);
    return this.value;
  }

  reset() {
    this.initialized = false;
  }
}
