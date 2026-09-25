export interface NecklaceAssetConfig {
  claspAnchorY: number;
  pendantAnchorY: number;
  chainWidthRatio: number;
  flipV?: boolean;
}

export const NECKLACE_CONFIGS: Record<string, NecklaceAssetConfig> = {
  'necklace-1': {
    claspAnchorY: 0.396,
    pendantAnchorY: 0.816,
    chainWidthRatio: 0.82,
    flipV: true,
  },
  'necklace-2': {
    claspAnchorY: 0.25,
    pendantAnchorY: 0.88,
    chainWidthRatio: 0.70,
    flipV: false,
  },
};

export const NECKLACE_ASSET = NECKLACE_CONFIGS['necklace-1'];

export function getNecklaceImageSpan(config: NecklaceAssetConfig = NECKLACE_CONFIGS['necklace-1']): number {
  return config.pendantAnchorY - config.claspAnchorY;
}

export interface NecklacePlacementInput {
  chinY: number;
  cheekWidth: number;
  jawWidth: number;
  assetAspect: number;
}

export interface NecklacePlacement {
  centerX: number;
  /** Screen Y for the pendant anchor (upper chest) */
  chestY: number;
  scale: number;
}

/**
 * Sizes necklace from neck width (jaw span) so the chain fits the neck,
 * with a light body-span check so the pendant hang stays proportional.
 */
export function computeNecklacePlacement(
  input: NecklacePlacementInput,
  centerX: number,
  config: NecklaceAssetConfig = NECKLACE_CONFIGS['necklace-1'],
): NecklacePlacement {
  const { chinY, cheekWidth, jawWidth, assetAspect } = input;
  const { chainWidthRatio } = config;
  const imageSpan = getNecklaceImageSpan(config);

  const neckY = chinY + cheekWidth * 0.24;
  const chestY = chinY + cheekWidth * 0.58;

  const bodySpan = Math.max(chestY - neckY, cheekWidth * 0.34);
  const scaleFromBody = (bodySpan / imageSpan) * assetAspect;

  // Chain span at clasp ≈ jaw width (neck), not full cheek width
  const scaleFromNeck = (jawWidth * 1.02) / chainWidthRatio;

  const scale = Math.min(
    scaleFromNeck * 1.05,
    Math.max(scaleFromBody, scaleFromNeck * 0.9),
  );

  return { centerX, chestY, scale };
}

