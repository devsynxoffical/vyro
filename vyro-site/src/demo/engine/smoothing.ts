export class SmoothPoint {
  private x = 0;
  private y = 0;
  private initialized = false;
  private alpha: number;

  constructor(alpha = 0.35) {
    this.alpha = alpha;
  }

  update(targetX: number, targetY: number): { x: number; y: number } {
    if (!this.initialized) {
      this.x = targetX;
      this.y = targetY;
      this.initialized = true;
      return { x: this.x, y: this.y };
    }

    this.x += (targetX - this.x) * this.alpha;
    this.y += (targetY - this.y) * this.alpha;
    return { x: this.x, y: this.y };
  }

  reset() {
    this.initialized = false;
  }
}

export class SmoothValue {
  private value = 0;
  private initialized = false;
  private alpha: number;

  constructor(alpha = 0.3) {
    this.alpha = alpha;
  }

  update(target: number): number {
    if (!this.initialized) {
      this.value = target;
      this.initialized = true;
      return this.value;
    }

    this.value += (target - this.value) * this.alpha;
    return this.value;
  }

  reset() {
    this.initialized = false;
  }
}

export class SmoothAngle {
  private value = 0;
  private initialized = false;
  private alpha: number;

  constructor(alpha = 0.3) {
    this.alpha = alpha;
  }

  update(target: number): number {
    if (!this.initialized) {
      this.value = target;
      this.initialized = true;
      return this.value;
    }

    let diff = target - this.value;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    this.value += diff * this.alpha;
    return this.value;
  }

  reset() {
    this.initialized = false;
  }
}
