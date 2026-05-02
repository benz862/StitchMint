const DEFAULT_DEV_DEMO_LINK = "https://buy.stripe.com/test_fZu4gz2k77jD7o94zp8Vi01";

/**
 * Optional Stripe Payment Link for workshop/demo. When non-null, Unlock skips API Checkout
 * for every pricing tier (one Payment Link — not per-tier Stripe line items / webhook patternId).
 *
 * Production: set `NEXT_PUBLIC_DEMO_BASIC_STRIPE_PAYMENT_LINK` to your full `https://buy.stripe.com/...` URL.
 * Set to `false` (or `api`) for normal Checkout + webhook ZIP fulfillment.
 *
 * Development: if unset, falls back to the default test link for local demos.
 */
export function demoPaymentLinkUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_DEMO_BASIC_STRIPE_PAYMENT_LINK?.trim();
  if (raw === "" || raw === "false" || raw === "0" || raw === "api") return null;
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  if (process.env.NODE_ENV === "development") return DEFAULT_DEV_DEMO_LINK;
  return null;
}
