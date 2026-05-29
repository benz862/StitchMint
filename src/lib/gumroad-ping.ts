import { gumroadPatternFieldName } from "@/config/gumroad-checkout";
import { patternIdFromSignedGumroadCheckoutToken } from "@/lib/gumroad-checkout-sign";

export type GumroadPingBody = Record<string, string>;

export function parseGumroadPingBody(bodyText: string): GumroadPingBody {
  const params = new URLSearchParams(bodyText);
  return Object.fromEntries(params.entries());
}

function urlParamFromPing(body: GumroadPingBody, key: string): string | undefined {
  return body[key] ?? body[`url_params[${key}]`];
}

/** Extract pattern UUID from signed checkout token or legacy custom-field / URL params. */
export function patternIdFromGumroadPing(body: GumroadPingBody): string | null {
  const signed = urlParamFromPing(body, "st");
  if (signed) {
    const fromSigned = patternIdFromSignedGumroadCheckoutToken(signed);
    if (fromSigned) return fromSigned;
  }

  const field = gumroadPatternFieldName();
  const legacyCandidates = [
    urlParamFromPing(body, field),
    urlParamFromPing(body, "pattern_id"),
    body[field],
    body["pattern_id"],
    body["Pattern ID"],
    body["pattern id"],
    body[`custom_fields[${field}]`],
    body["custom_fields[pattern_id]"],
  ];
  for (const raw of legacyCandidates) {
    const id = raw?.trim();
    if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return id;
  }
  return null;
}

export function gumroadSaleExternalId(saleId: string): string {
  return `gumroad:${saleId}`;
}

export function isGumroadRefund(body: GumroadPingBody): boolean {
  return body.refunded === "true";
}

export function gumroadPriceCents(body: GumroadPingBody): number {
  const n = Number.parseInt(String(body.price ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}
