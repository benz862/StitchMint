/** Only allow same-origin relative paths (for `next` after login). */
export function safeRedirectPath(raw: string | null | undefined, fallback = "/my-patterns"): string {
  if (!raw) return fallback;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return fallback;
  if (t.includes("://") || t.includes("<") || t.includes("\\")) return fallback;
  const noQuery = t.split("?")[0] ?? fallback;
  return noQuery.slice(0, 512) || fallback;
}
