import { gumroadPatternFieldName } from "@/config/gumroad-checkout";

export type GumroadPingBody = Record<string, string>;

export function parseGumroadPingBody(bodyText: string): GumroadPingBody {
  const params = new URLSearchParams(bodyText);
  return Object.fromEntries(params.entries());
}

/** Extract pattern UUID from Ping payload or URL-prefilled custom field. */
export function patternIdFromGumroadPing(body: GumroadPingBody): string | null {
  const field = gumroadPatternFieldName();
  const candidates = [
    body[field],
    body["pattern_id"],
    body["Pattern ID"],
    body["pattern id"],
    body[`custom_fields[${field}]`],
    body["custom_fields[pattern_id]"],
  ];
  for (const raw of candidates) {
    const id = raw?.trim();
    if (id && /^[0-9a-f-]{36}$/i.test(id)) return id;
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
