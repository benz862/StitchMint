import type { PricingTierConfig } from "@/config/pricing";
import type { DetailLevelId } from "@/lib/constants";
import { finishedSizeInches, inchesToCm } from "@/lib/measurements";

/** Defaults used outside the create flow, where a crop shape and fabric have not been selected yet. */
export const TIER_SIZE_REFERENCE_FABRIC_COUNT = 14;
export const TIER_SIZE_REFERENCE_ASPECT = 1;

const DETAIL_LABELS: Record<DetailLevelId, string> = {
  beginner: "Simpler detail, fewer colors",
  balanced: "Balanced detail",
  detailed: "High detail — great for portraits & pets",
  expert: "Maximum detail & color range",
};

export function referenceStitchHeight(stitchWidth: number, aspect = TIER_SIZE_REFERENCE_ASPECT): number {
  return Math.max(40, Math.round(stitchWidth / aspect));
}

export function approximateFinishedSizeForTier(
  tier: Pick<PricingTierConfig, "engine">,
  fabricCount = TIER_SIZE_REFERENCE_FABRIC_COUNT,
  aspect = TIER_SIZE_REFERENCE_ASPECT,
) {
  const w = tier.engine.stitchWidth;
  const h = referenceStitchHeight(w, aspect);
  return finishedSizeInches(w, h, fabricCount);
}

export function tierFinishedSizeSummary(
  tier: PricingTierConfig,
  fabricCount = TIER_SIZE_REFERENCE_FABRIC_COUNT,
  aspect = TIER_SIZE_REFERENCE_ASPECT,
): string {
  const { widthIn, heightIn } = approximateFinishedSizeForTier(tier, fabricCount, aspect);
  const cmW = inchesToCm(widthIn);
  const cmH = inchesToCm(heightIn);
  return `~${widthIn.toFixed(1)}″ × ${heightIn.toFixed(1)}″ finished (${cmW.toFixed(0)} × ${cmH.toFixed(0)} cm)`;
}

export function tierStitchGridSummary(tier: PricingTierConfig, aspect = TIER_SIZE_REFERENCE_ASPECT): string {
  const w = tier.engine.stitchWidth;
  const h = referenceStitchHeight(w, aspect);
  return `${w} × ${h} stitch grid`;
}

export function tierDetailSummary(tier: PricingTierConfig): string {
  return DETAIL_LABELS[tier.engine.detailLevel] ?? "Balanced detail";
}

export type TierCardFact = { label: string; value: string };

/** Key facts shown on tier selection (step 3) and marketing pricing blocks. */
export function tierCardFacts(
  tier: PricingTierConfig,
  fabricCount = TIER_SIZE_REFERENCE_FABRIC_COUNT,
  aspect = TIER_SIZE_REFERENCE_ASPECT,
): TierCardFact[] {
  return [
    { label: "Finished size", value: `${tierFinishedSizeSummary(tier, fabricCount, aspect)} on ${fabricCount}-count Aida` },
    { label: "Chart size", value: tierStitchGridSummary(tier, aspect) },
    { label: "Detail", value: tierDetailSummary(tier) },
    {
      label: "Includes",
      value: "ZIP with 2 chart PDFs (regular + large print), symbol chart & DMC thread list",
    },
  ];
}
