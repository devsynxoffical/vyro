import type { LoadedImage } from './TryOnEngine';

/**
 * Necklaces are rendered as a physical loop fitted around a neck cylinder and
 * hanging down the chest, projected onto the video, rather than as a flat
 * picture: the ends curve behind the neck, the drape foreshortens on the
 * collarbone shelf, pearls are shaded spheres and chains metallic strokes.
 */

export type ChainColor = 'gold' | 'silver';

export interface NecklaceStyle {
  kind: 'pearls' | 'chain';
  /** Full loop length as sold */
  lengthCm: number;
  pearlMm?: number;
  chainColor?: ChainColor;
  chainMm?: number;
  pendant?: { src: string; heightMm: number };
}

export const NECKLACE_STYLES: Record<string, NecklaceStyle> = {
  'necklace-1': {
    kind: 'chain',
    lengthCm: 45,
    chainColor: 'gold',
    chainMm: 1.4,
    pendant: { src: '/products/pendant-diamond.webp', heightMm: 11 },
  },
  'necklace-2': { kind: 'pearls', lengthCm: 42, pearlMm: 7.5 },
  'necklace-3': {
    kind: 'chain',
    lengthCm: 45,
    chainColor: 'silver',
    chainMm: 1.2,
    pendant: { src: '/products/pendant-emerald.webp', heightMm: 24 },
  },
};

/** Where the neck is on screen, in pixels, plus the scale of the scene. */
export interface NeckFrame {
  /** Neck axis at the neck base (collar line) */
  x: number;
  y: number;
  radiusPx: number;
  pxPerCm: number;
  /** Shoulder-line tilt */
  angle: number;
}

/** cm; x right, y down, z towards the camera; origin on the neck axis at base height */
interface P3 {
  x: number;
  y: number;
  z: number;
  /** 1 on the chest, fading to 0 as the chain turns behind the neck */
  vis: number;
}

interface P2 {
  x: number;
  y: number;
  z: number;
  scale: number;
  vis: number;
}

/** The chest below the collarbones slopes away from the camera. */
const CHEST_TILT = 0.78;
/** How far around the neck sides the chain is drawn before it is hidden */
const WRAP_ANGLE = 0.5;
/** Perspective: size change per cm of depth */
const DEPTH_SCALE = 0.012;

const CHAIN_COLORS: Record<ChainColor, { base: string; light: string; dark: string }> = {
  gold: { base: '#caa03a', light: '#fff0b0', dark: '#7a5a12' },
  silver: { base: '#a7adb5', light: '#f7f9fb', dark: '#5c6169' },
};

/** Half-ellipse perimeter (Ramanujan) for semi-axes a, b */
function halfEllipse(a: number, b: number): number {
  const h = 3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b));
  return (Math.PI * h) / 2;
}

/**
 * How far the front of the loop hangs below the neck base: whatever length
 * is left after the back half sits on the neck, laid out as a half-ellipse
 * as wide as the neck.
 */
export function frontDropCm(lengthCm: number, neckRadiusCm: number): number {
  const front = Math.max(lengthCm - Math.PI * neckRadiusCm, 2.2 * neckRadiusCm);
  let lo = 0.5;
  let hi = lengthCm;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (halfEllipse(neckRadiusCm, mid) < front) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The visible part of the loop, ordered from the wearer's right to left. */
function buildCurve(lengthCm: number, r: number): P3[] {
  const drop = frontDropCm(lengthCm, r);
  const pts: P3[] = [];
  const wrapSteps = 14;
  const frontSteps = 160;

  // Right side curving out from behind the neck.
  for (let i = wrapSteps; i >= 1; i--) {
    const psi = (i / wrapSteps) * WRAP_ANGLE;
    pts.push({
      x: r * Math.cos(psi),
      y: -0.25 * r * Math.sin(psi),
      z: -r * Math.sin(psi),
      vis: 1 - Math.pow(Math.sin(psi) / Math.sin(WRAP_ANGLE), 1.3),
    });
  }
  // Front drape: leaves the neck at its sides and hangs on the chest.
  for (let i = 0; i <= frontSteps; i++) {
    const phi = (i / frontSteps) * Math.PI;
    const s = Math.sin(phi);
    pts.push({
      x: r * Math.cos(phi),
      y: drop * Math.pow(s, 0.9),
      z: s * (r - 0.55 * drop),
      vis: 1,
    });
  }
  // Left side turning back behind the neck.
  for (let i = 1; i <= wrapSteps; i++) {
    const psi = (i / wrapSteps) * WRAP_ANGLE;
    pts.push({
      x: -r * Math.cos(psi),
      y: -0.25 * r * Math.sin(psi),
      z: -r * Math.sin(psi),
      vis: 1 - Math.pow(Math.sin(psi) / Math.sin(WRAP_ANGLE), 1.3),
    });
  }
  return pts;
}

function project(p: P3, f: NeckFrame): P2 {
  const s = f.pxPerCm;
  const lx = p.x * s;
  // Hanging part is foreshortened by the chest slope; the neck part is not.
  const ly = (p.y > 0 ? p.y * CHEST_TILT : p.y) * s;
  const cos = Math.cos(f.angle);
  const sin = Math.sin(f.angle);
  return {
    x: f.x + lx * cos - ly * sin,
    y: f.y + lx * sin + ly * cos,
    z: p.z,
    scale: 1 + p.z * DEPTH_SCALE,
    vis: p.vis,
  };
}

function dist3(a: P3, b: P3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Points spaced every `stepCm` along the curve's true (3D) length. */
function resample(curve: P3[], stepCm: number): P3[] {
  const out: P3[] = [];
  let carry = stepCm / 2;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    const len = dist3(a, b);
    let t = carry;
    while (t <= len) {
      const k = t / len;
      out.push({
        x: a.x + (b.x - a.x) * k,
        y: a.y + (b.y - a.y) * k,
        z: a.z + (b.z - a.z) * k,
        vis: a.vis + (b.vis - a.vis) * k,
      });
      t += stepCm;
    }
    carry = t - len;
  }
  return out;
}

function drawPearl(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, alpha: number) {
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.38, R * 0.08, x, y, R);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, '#fbf7f0');
  g.addColorStop(0.72, '#e6dccf');
  g.addColorStop(1, '#a89a8b');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  // Warm reflected light along the lower rim, then the specular point.
  const rim = ctx.createRadialGradient(x + R * 0.25, y + R * 0.35, R * 0.2, x, y, R);
  rim.addColorStop(0, 'rgba(255,220,200,0.35)');
  rim.addColorStop(0.6, 'rgba(255,220,200,0)');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.ellipse(x - R * 0.36, y - R * 0.4, R * 0.2, R * 0.15, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, alpha: number) {
  const g = ctx.createRadialGradient(x, y, R * 0.2, x, y, R);
  g.addColorStop(0, `rgba(30,15,10,${0.35 * alpha})`);
  g.addColorStop(1, 'rgba(30,15,10,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, R, R * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
}

function strokeChain(
  ctx: CanvasRenderingContext2D,
  pts: P2[],
  width: number,
  color: string,
  dy: number,
  alphaScale: number,
) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const vis = Math.min(a.vis, b.vis) * alphaScale;
    if (vis <= 0.01) continue;
    ctx.globalAlpha = vis;
    ctx.lineWidth = width * (a.scale + b.scale) / 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + dy);
    ctx.lineTo(b.x, b.y + dy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function renderNecklace(
  ctx: CanvasRenderingContext2D,
  style: NecklaceStyle,
  frame: NeckFrame,
  pendant: LoadedImage | null,
) {
  const s = frame.pxPerCm;
  if (s < 2 || frame.radiusPx < 4) return;
  const rCm = frame.radiusPx / s;
  const curve = buildCurve(style.lengthCm, rCm);

  ctx.save();
  if (style.kind === 'pearls') {
    const dCm = (style.pearlMm ?? 7.5) / 10;
    const centres = resample(curve, dCm * 1.07)
      .map((p) => project(p, frame))
      .sort((a, b) => a.z - b.z);
    const R = (dCm / 2) * s;
    for (const p of centres) {
      if (p.vis > 0.02) drawShadow(ctx, p.x + R * 0.15, p.y + R * 0.45, R * 1.05 * p.scale, p.vis);
    }
    for (const p of centres) {
      if (p.vis > 0.02) drawPearl(ctx, p.x, p.y, R * p.scale, p.vis);
    }
  } else {
    const colors = CHAIN_COLORS[style.chainColor ?? 'gold'];
    const w = Math.max(1.4, ((style.chainMm ?? 1.3) / 10) * s);
    const pts = curve.map((p) => project(p, frame));
    strokeChain(ctx, pts, w * 1.6, 'rgba(20,10,5,0.28)', w * 0.9, 1);
    strokeChain(ctx, pts, w, colors.dark, w * 0.25, 1);
    strokeChain(ctx, pts, w * 0.85, colors.base, 0, 1);
    strokeChain(ctx, pts, w * 0.35, colors.light, -w * 0.2, 0.9);
  }

  if (style.pendant && pendant) {
    // Lowest point of the drape; a pendant hangs straight down under gravity.
    const low = project(curve.reduce((m, p) => (p.y > m.y ? p : m), curve[0]), frame);
    const h = (style.pendant.heightMm / 10) * s * low.scale;
    const wImg = h * pendant.aspect;
    ctx.globalAlpha = 1;
    ctx.drawImage(pendant.image, low.x - wImg / 2, low.y - h * 0.1, wImg, h);
  }
  ctx.restore();
}
