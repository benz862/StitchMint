import type { PricingTierId } from "@/config/pricing";
import { buildSignedGumroadCheckoutToken } from "@/lib/gumroad-checkout-sign";

/** Production Gumroad permalinks (override via env). */
export const GUMROAD_DEFAULT_URL_BASIC = "https://skillbinder.gumroad.com/l/xhcfx";
export const GUMROAD_DEFAULT_URL_PLUS = "https://skillbinder.gumroad.com/l/quumdh";
export const GUMROAD_DEFAULT_URL_PRO = "https://skillbinder.gumroad.com/l/whhlqy";

/** Gumroad product permalink slug → StitchMint pricing tier (Ping `permalink` field). */
export const GUMROAD_PERMALINK_TO_TIER: Record<string, PricingTierId> = {
  xhcfx: "basic",
  quumdh: "plus",
  whhlqy: "pro",
};

export function pricingTierFromGumroadPermalink(permalink: string | null | undefined): PricingTierId | null {
  const slug = permalink?.trim().toLowerCase();
  if (!slug) return null;
  return GUMROAD_PERMALINK_TO_TIER[slug] ?? null;
}

function gumroadCheckoutDisabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_GUMROAD_CHECKOUT?.trim().toLowerCase();
  return raw === "false" || raw === "0" || raw === "stripe";
}

function resolveUrlFromEnv(envKey: string, fallback: string): string | null {
  const raw = process.env[envKey]?.trim();
  if (raw === "false" || raw === "") return null;
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  return fallback;
}

/** Gumroad product URL for this tier, or null (falls back to Stripe when unset/disabled). */
export function gumroadProductUrl(tierId: PricingTierId): string | null {
  if (gumroadCheckoutDisabled()) return null;
  if (tierId === "basic") return resolveUrlFromEnv("NEXT_PUBLIC_GUMROAD_URL_BASIC", GUMROAD_DEFAULT_URL_BASIC);
  if (tierId === "plus") return resolveUrlFromEnv("NEXT_PUBLIC_GUMROAD_URL_PLUS", GUMROAD_DEFAULT_URL_PLUS);
  if (tierId === "pro") return resolveUrlFromEnv("NEXT_PUBLIC_GUMROAD_URL_PRO", GUMROAD_DEFAULT_URL_PRO);
  return null;
}

/** Custom field name on Gumroad products; must match URL param and Ping payload keys. */
export function gumroadPatternFieldName(): string {
  return process.env.GUMROAD_PATTERN_FIELD?.trim() || "pattern_id";
}

/**
 * Product page URL with signed checkout token (`st`) when GUMROAD_CHECKOUT_SIGNING_SECRET is set.
 * Prefer this over a visible Gumroad custom field — buyers cannot edit `st` without breaking fulfillment.
 */
export function buildGumroadCheckoutUrl(
  productUrl: string,
  opts: { patternId: string; email?: string | null },
): string {
  const u = new URL(productUrl);
  const signed = buildSignedGumroadCheckoutToken(opts.patternId);
  if (signed) {
    u.searchParams.set("st", signed);
  } else {
    const field = gumroadPatternFieldName();
    u.searchParams.set(field, opts.patternId);
  }
  if (opts.email?.trim()) u.searchParams.set("email", opts.email.trim());
  return u.toString();
}
