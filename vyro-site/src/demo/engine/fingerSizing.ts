interface Point2 {
  x: number;
  y: number;
}

interface Point3 {
  x: number;
  y: number;
  z: number;
}

function dist2D(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function dist3D(a: Point3, b: Point3, w: number, h: number): number {
  const dx = (a.x - b.x) * w;
  const dy = (a.y - b.y) * h;
  const dz = (a.z - b.z) * w;
  return Math.hypot(dx, dy, dz);
}

function perpDistance(a: Point2, b: Point2, p: Point2): number {
  const ax = b.x - a.x;
  const ay = b.y - a.y;
  const len = Math.hypot(ax, ay) || 1;
  return Math.abs(ax * (p.y - a.y) - ay * (p.x - a.x)) / len;
}

/** Drop the lowest outlier, average the rest */
function trimmedMean(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const kept = sorted.slice(1);
  return kept.reduce((sum, v) => sum + v, 0) / kept.length;
}

export interface FingerSizingInput {
  ringMcp: Point3;
  ringPip: Point3;
  middleMcp: Point3;
  middlePip: Point3;
  wrist: Point3;
  alongFinger: number;
  frameW: number;
  frameH: number;
  toScreen: (x: number, y: number) => Point2;
}

export interface FingerSizingResult {
  fingerWidth: number;
  ringOuterWidth: number;
  palmScale: number;
}

const RING_FIT = 1.32;

/**
 * Estimates finger thickness from hand geometry, blended with segment length
 * so size grows naturally when the hand moves closer to the camera.
 */
export function estimateFingerSize(input: FingerSizingInput): FingerSizingResult {
  const {
    ringMcp,
    ringPip,
    middleMcp,
    middlePip,
    wrist,
    alongFinger,
    frameW,
    frameH,
    toScreen,
  } = input;

  const mcpPt = toScreen(ringMcp.x, ringMcp.y);
  const pipPt = toScreen(ringPip.x, ringPip.y);
  const middleMcpPt = toScreen(middleMcp.x, middleMcp.y);
  const middlePipPt = toScreen(middlePip.x, middlePip.y);

  const ringPt: Point2 = {
    x: mcpPt.x + (pipPt.x - mcpPt.x) * alongFinger,
    y: mcpPt.y + (pipPt.y - mcpPt.y) * alongFinger,
  };
  const middlePt: Point2 = {
    x: middleMcpPt.x + (middlePipPt.x - middleMcpPt.x) * alongFinger,
    y: middleMcpPt.y + (middlePipPt.y - middleMcpPt.y) * alongFinger,
  };

  const proxLen = dist2D(mcpPt, pipPt);
  const knuckleSpread = dist2D(mcpPt, middleMcpPt);
  const palmScale = dist3D(wrist, middleMcp, frameW, frameH);

  const widthFromGap = dist2D(ringPt, middlePt) * 0.64;
  const widthFromPerp = perpDistance(mcpPt, pipPt, middleMcpPt) * 1.02;
  const widthFromKnuckle = knuckleSpread * 0.6;
  const widthFromPalm = palmScale * 0.1;
  const widthFrom3D = dist3D(ringMcp, ringPip, frameW, frameH) * 0.34;

  const fingerThickness = trimmedMean([
    widthFromGap,
    widthFromPerp,
    widthFromKnuckle,
    widthFromPalm,
    widthFrom3D,
  ]);

  // Segment length carries camera-distance signal; thickness cues carry finger width
  const segmentWidth = proxLen * 0.5;
  const blendedWidth = fingerThickness * 0.48 + segmentWidth * 0.52;

  let ringOuterWidth = blendedWidth * RING_FIT;

  const openness = knuckleSpread / (proxLen || 1);
  if (openness > 0.45) {
    ringOuterWidth *= 1 - Math.min((openness - 0.45) * 0.35, 0.15);
  }

  return { fingerWidth: blendedWidth, ringOuterWidth, palmScale };
}
