export interface WatchGeometry {
  /** Case width (incl. lugs) as a fraction of the image width */
  caseWidthFrac: number;
  /** Vertical centre of the case as a fraction of the image height */
  caseCenterY: number;
}

export interface AlphaBounds {
  /** Fractions of the image size */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const DEFAULT_WATCH_GEOMETRY: WatchGeometry = { caseWidthFrac: 0.6, caseCenterY: 0.5 };
export const DEFAULT_ALPHA_BOUNDS: AlphaBounds = { left: 0, right: 1, top: 0, bottom: 1 };

const SAMPLE_WIDTH = 256;
const ALPHA_THRESHOLD = 100;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

interface Row {
  y: number;
  left: number;
  right: number;
}

/** Per-row opaque extents of a downsampled copy of the image, or null if unreadable. */
function scanRows(image: HTMLImageElement): { rows: Row[]; w: number; h: number } | null {
  const w = SAMPLE_WIDTH;
  const h = Math.max(1, Math.round((image.naturalHeight / (image.naturalWidth || 1)) * w));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }

  const rows: Row[] = [];
  for (let y = 0; y < h; y++) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (left < 0) left = x;
        right = x;
      }
    }
    if (left >= 0) rows.push({ y, left, right });
  }
  return { rows, w, h };
}

/** Bounding box of the opaque pixels, as fractions of the image size. */
export function measureAlphaBounds(image: HTMLImageElement): AlphaBounds {
  const scan = scanRows(image);
  if (!scan || scan.rows.length === 0) return DEFAULT_ALPHA_BOUNDS;
  const { rows, w, h } = scan;
  return {
    left: Math.min(...rows.map((r) => r.left)) / w,
    right: (Math.max(...rows.map((r) => r.right)) + 1) / w,
    top: rows[0].y / h,
    bottom: (rows[rows.length - 1].y + 1) / h,
  };
}

/**
 * Measures a top-down watch cutout (strap running vertically) from its alpha
 * channel, so any new watch image fits the wrist without hand-tuned numbers.
 * The case is found as the rows noticeably wider than the strap; only the left
 * edge is used so a crown sticking out on the right does not inflate the width.
 */
export function measureWatchGeometry(image: HTMLImageElement): WatchGeometry {
  const scan = scanRows(image);
  if (!scan || scan.rows.length < 10) return DEFAULT_WATCH_GEOMETRY;
  const { rows, w, h } = scan;

  const centerX = median(rows.map((r) => (r.left + r.right) / 2));
  const halfWidths = rows.map((r) => centerX - r.left);
  const strapHalf = median(halfWidths);
  const caseRows = rows.filter((_, i) => halfWidths[i] > strapHalf * 1.2);
  // No case wider than the strap: not a top-down vertical-strap image.
  if (caseRows.length < 3) return DEFAULT_WATCH_GEOMETRY;

  const caseHalf = Math.max(...caseRows.map((r) => centerX - r.left));
  const top = caseRows[0].y;
  const bottom = caseRows[caseRows.length - 1].y;

  return {
    caseWidthFrac: Math.min(1, (caseHalf * 2) / w),
    caseCenterY: (top + bottom) / 2 / h,
  };
}
