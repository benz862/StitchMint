import type { DetailLevelId } from "@/lib/constants";

/**
 * Single source of truth for StitchMint pricing tiers, Stripe linkage, and engine presets.
 * Tier ids align with Stripe lookup keys: pattern_basic → basic, pattern_premium → plus, pattern_pro → pro.
 */
export const PRICING_TIER_IDS = ["basic", "plus", "pro"] as const;
export type PricingTierId = (typeof PRICING_TIER_IDS)[number];

export type PricingTierConfig = {
  id: PricingTierId;
  name: string;
  description: string;
  /** Display only, e.g. "$9.95" */
  priceLabel: string;
  /** USD cents; must match the Stripe Price amount when using Price IDs */
  priceCents: number;
  stripeProductId: string;
  stripePriceId: string;
  featured?: boolean;
  features: string[];
  /** Pattern engine inputs for this paid tier */
  engine: { detailLevel: DetailLevelId; stitchWidth: number };
};

/** Same Product in Stripe for all three one-time prices (dashboard: StitchMint). */
const STRIPE_PRODUCT_STITCHMINT = "prod_UR8zBss2o6huBV";

export const PRICING_TIERS: readonly PricingTierConfig[] = [
  {
    id: "basic",
    name: "Basic Pattern",
    description: "Best for simple images, small projects, and first-time stitchers.",
    priceLabel: "$9.95",
    priceCents: 995,
    stripeProductId: STRIPE_PRODUCT_STITCHMINT,
    /** Stripe: pattern_basic */
    stripePriceId: "price_1TSGhUE6oTidvpnU40GWWPJL",
    features: [
      "Small/standard pattern size",
      "PDF pattern download",
      "Color chart",
      "Thread list",
      "Basic image conversion",
    ],
    engine: { detailLevel: "beginner", stitchWidth: 80 },
  },
  {
    id: "plus",
    name: "Premium Pattern",
    description: "Best for detailed portraits, pets, gifts, and wall-ready projects.",
    priceLabel: "$14.95",
    priceCents: 1495,
    stripeProductId: STRIPE_PRODUCT_STITCHMINT,
    /** Stripe: pattern_premium */
    stripePriceId: "price_1TSGhVE6oTidvpnUteD7W8U7",
    featured: true,
    features: [
      "Larger pattern size",
      "Higher color accuracy",
      "PDF pattern download",
      "Symbol chart",
      "Thread list",
      "Preview before purchase",
    ],
    engine: { detailLevel: "detailed", stitchWidth: 120 },
  },
  {
    id: "pro",
    name: "Pro Pattern",
    description: "Best for heirloom-quality projects and highly detailed images.",
    priceLabel: "$24.95",
    priceCents: 2495,
    stripeProductId: STRIPE_PRODUCT_STITCHMINT,
    /** Stripe: pattern_pro */
    stripePriceId: "price_1TSGhVE6oTidvpnUNpKFwbU2",
    features: [
      "Largest pattern size",
      "Best detail retention",
      "Advanced color reduction",
      "PDF pattern download",
      "Symbol chart",
      "Thread list",
      "Pro printable package",
    ],
    engine: { detailLevel: "expert", stitchWidth: 200 },
  },
] as const;

export function isPricingTierId(value: string): value is PricingTierId {
  return (PRICING_TIER_IDS as readonly string[]).includes(value);
}

/** Older app builds stored `starter` / `premium` as tier ids. */
const LEGACY_PRICING_TIER_IDS: Record<string, PricingTierId> = {
  starter: "basic",
  premium: "pro",
};

export function normalizePricingTierId(value: string | null | undefined): PricingTierId | null {
  if (!value) return null;
  if (isPricingTierId(value)) return value;
  const mapped = LEGACY_PRICING_TIER_IDS[value];
  return mapped ?? null;
}

export function getPricingTierById(id: string): PricingTierConfig | undefined {
  const normalized = normalizePricingTierId(id);
  if (!normalized) return undefined;
  return PRICING_TIERS.find((t) => t.id === normalized);
}

/** Primary env keys; legacy keys still read in resolveStripePriceId for older deployments. */
const STRIPE_PRICE_ENV_KEYS: Record<PricingTierId, string> = {
  basic: "STRIPE_PRICE_ID_BASIC",
  plus: "STRIPE_PRICE_ID_PLUS",
  pro: "STRIPE_PRICE_ID_PRO",
};

const STRIPE_PRICE_LEGACY_ENV_KEYS: Partial<Record<PricingTierId, string>> = {
  basic: "STRIPE_PRICE_ID_STARTER",
  pro: "STRIPE_PRICE_ID_PREMIUM",
};

export function resolveStripePriceId(tierId: PricingTierId): string | undefined {
  const primary = typeof process !== "undefined" ? process.env[STRIPE_PRICE_ENV_KEYS[tierId]]?.trim() : undefined;
  if (primary) return primary;
  const legacyKey = STRIPE_PRICE_LEGACY_ENV_KEYS[tierId];
  const legacy = legacyKey && typeof process !== "undefined" ? process.env[legacyKey]?.trim() : undefined;
  if (legacy) return legacy;
  const tier = PRICING_TIERS.find((t) => t.id === tierId);
  const fromConfig = tier?.stripePriceId?.trim();
  if (fromConfig?.startsWith("price_")) return fromConfig;
  return undefined;
}

export function resolveStripeProductId(tierId: PricingTierId): string | undefined {
  const envKey = `STRIPE_PRODUCT_ID_${tierId.toUpperCase()}`;
  const fromEnv = typeof process !== "undefined" ? process.env[envKey]?.trim() : undefined;
  if (fromEnv?.startsWith("prod_")) return fromEnv;
  const tier = PRICING_TIERS.find((t) => t.id === tierId);
  const fromConfig = tier?.stripeProductId?.trim();
  if (fromConfig?.startsWith("prod_")) return fromConfig;
  return undefined;
}

/** If API receives legacy stitch/detail without `pricingTier`, infer the closest tier for storage and checkout. */
export function inferPricingTierFromEngine(detailLevel: DetailLevelId, stitchWidth: number): PricingTierId {
  const exact = PRICING_TIERS.find(
    (t) => t.engine.detailLevel === detailLevel && t.engine.stitchWidth === stitchWidth,
  );
  if (exact) return exact.id;
  if (detailLevel === "beginner" || stitchWidth <= 80) return "basic";
  if (detailLevel === "expert" || stitchWidth >= 200) return "pro";
  return "plus";
}
