import type { PricingTierId } from "@/config/pricing";

/** Production Gumroad permalinks (override via env). */
export const GUMROAD_DEFAULT_URL_BASIC = "https://skillbinder.gumroad.com/l/xhcfx";
export const GUMROAD_DEFAULT_URL_PLUS = "https://skillbinder.gumroad.com/l/quumdh";

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

/** Gumroad product URL for this tier, or null (use Stripe — e.g. Pro). */
export function gumroadProductUrl(tierId: PricingTierId): string | null {
  if (gumroadCheckoutDisabled()) return null;
  if (tierId === "basic") return resolveUrlFromEnv("NEXT_PUBLIC_GUMROAD_URL_BASIC", GUMROAD_DEFAULT_URL_BASIC);
  if (tierId === "plus") return resolveUrlFromEnv("NEXT_PUBLIC_GUMROAD_URL_PLUS", GUMROAD_DEFAULT_URL_PLUS);
  return null;
}

/** Custom field name on Gumroad products; must match URL param and Ping payload keys. */
export function gumroadPatternFieldName(): string {
  return process.env.GUMROAD_PATTERN_FIELD?.trim() || "pattern_id";
}

export function buildGumroadCheckoutUrl(
  productUrl: string,
  opts: { patternId: string; email?: string | null },
): string {
  const field = gumroadPatternFieldName();
  const u = new URL(productUrl);
  u.searchParams.set(field, opts.patternId);
  if (opts.email?.trim()) u.searchParams.set("email", opts.email.trim());
  u.searchParams.set("wanted", "true");
  return u.toString();
}
