/**
 * Absolute app URL for metadata, redirects, and OAuth callbacks.
 * Browsers may throw "The string did not match the expected pattern" if `new URL()` receives a bad string.
 */
export function getPublicAppUrl(): URL {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (!raw) {
    return new URL("http://localhost:3000");
  }
  try {
    const u = new URL(raw);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return u;
    }
  } catch {
    /* fall through */
  }
  try {
    const host = raw.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!host) return new URL("http://localhost:3000");
    return new URL(`https://${host}`);
  } catch {
    return new URL("http://localhost:3000");
  }
}
