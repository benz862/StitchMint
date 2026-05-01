/**
 * Supabase clients expect the project API root, e.g. `https://xxxx.supabase.co`.
 * A trailing `/` or a `/rest/v1` suffix breaks Auth requests and can yield
 * "Invalid path specified in request URL" from GoTrue.
 */
export function normalizeSupabaseUrl(raw: string | undefined): string {
  if (!raw) return "";
  let u = raw.trim();
  u = u.replace(/\/rest\/v1\/?$/i, "");
  u = u.replace(/\/+$/, "");
  return u;
}
