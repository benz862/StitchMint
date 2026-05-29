import { createHmac, timingSafeEqual } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function signingSecret(): string | null {
  const s = process.env.GUMROAD_CHECKOUT_SIGNING_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

function signPatternId(patternId: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(patternId).digest("base64url");
  return `${patternId}.${mac}`;
}

/** Opaque signed token for Gumroad URL (`st` param). Buyers cannot change the pattern id without invalidating the signature. */
export function buildSignedGumroadCheckoutToken(patternId: string): string | null {
  if (!UUID_RE.test(patternId)) return null;
  const secret = signingSecret();
  if (!secret) return null;
  return signPatternId(patternId, secret);
}

export function patternIdFromSignedGumroadCheckoutToken(token: string): string | null {
  const trimmed = token.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0) return null;
  const patternId = trimmed.slice(0, dot);
  const mac = trimmed.slice(dot + 1);
  if (!UUID_RE.test(patternId) || !mac) return null;
  const secret = signingSecret();
  if (!secret) return null;
  const expected = createHmac("sha256", secret).update(patternId).digest("base64url");
  try {
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return patternId;
}

export function gumroadCheckoutSigningEnabled(): boolean {
  return signingSecret() !== null;
}
