import {
  getPricingTierById,
  isPricingTierId,
  normalizePricingTierId,
  resolveStripePriceId,
  type PricingTierId,
} from "@/config/pricing";
import type { DetailLevelId } from "@/lib/constants";

type CheckoutLineItem =
  | { price: string; quantity: 1 }
  | {
      quantity: 1;
      price_data: {
        currency: "usd";
        unit_amount: number;
        product_data: { name: string; description: string };
      };
    };

function formatPriceLabelFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

type PatternRowLike = {
  pricing_tier?: string | null;
  difficulty_mode?: string | null;
  stitch_width_setting?: number | null;
  stitch_width?: number | null;
  stitch_height?: number | null;
  color_count?: number | null;
  total_stitches?: number | null;
};

/** When `pricing_tier` is missing (legacy rows), infer a tier for checkout/display. */
function inferPricingTierIdFromLegacy(row: PatternRowLike): PricingTierId {
  const raw = (row.difficulty_mode ?? "balanced").toLowerCase();
  const detail = (["beginner", "balanced", "detailed", "expert"] as const).includes(raw as DetailLevelId)
    ? (raw as DetailLevelId)
    : "balanced";
  const setting = Number(row.stitch_width_setting ?? row.stitch_width ?? 120) || 120;
  const w = Number(row.stitch_width ?? setting) || setting;
  const h = Number(row.stitch_height ?? 0) || 0;
  const colors = Number(row.color_count ?? 0) || 0;
  const stitches = Number(row.total_stitches ?? 0) || w * h;

  if (detail === "expert" || setting >= 200 || colors >= 45 || stitches >= 32_000) {
    return "pro";
  }
  if (detail === "beginner" || (detail === "balanced" && setting <= 120 && colors <= 28 && stitches < 16_000)) {
    return "basic";
  }
  return "plus";
}

export function getPricingTierIdFromPatternRow(row: PatternRowLike): PricingTierId {
  const normalized = normalizePricingTierId(row.pricing_tier ?? undefined);
  if (normalized) return normalized;
  return inferPricingTierIdFromLegacy(row);
}

export function buildCheckoutLineItem(tierId: PricingTierId): CheckoutLineItem {
  const priceId = resolveStripePriceId(tierId);
  if (priceId) return { price: priceId, quantity: 1 };

  const legacy = process.env.STRIPE_PRICE_ID?.trim();
  const anyTierEnv =
    !!process.env.STRIPE_PRICE_ID_BASIC?.trim() ||
    !!process.env.STRIPE_PRICE_ID_PLUS?.trim() ||
    !!process.env.STRIPE_PRICE_ID_PRO?.trim() ||
    !!process.env.STRIPE_PRICE_ID_STARTER?.trim() ||
    !!process.env.STRIPE_PRICE_ID_PREMIUM?.trim();
  if (legacy && !anyTierEnv) return { price: legacy, quantity: 1 };

  const tier = getPricingTierById(tierId);
  if (!tier) {
    throw new Error(`Unknown pricing tier: ${tierId}`);
  }
  return {
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: tier.priceCents,
      product_data: {
        name: tier.name,
        description: tier.description,
      },
    },
  };
}

export function checkoutSummaryForPatternRow(row: PatternRowLike) {
  const tierId = getPricingTierIdFromPatternRow(row);
  const tier = getPricingTierById(tierId);
  const cents = tier?.priceCents ?? 995;
  return {
    tier: tierId,
    productName: tier?.name ?? "Basic Pattern",
    amountCents: cents,
    priceLabel: formatPriceLabelFromCents(cents),
  };
}
