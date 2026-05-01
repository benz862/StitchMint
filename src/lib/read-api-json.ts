/**
 * Parse JSON API responses without throwing on empty/HTML error bodies.
 */
export async function readApiJson<T extends Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    if (res.status >= 500) {
      throw new Error(
        "Server error (empty response). Open the terminal running `next dev` for details. Common fix: set SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, and run the database migration.",
      );
    }
    throw new Error(`Request failed (${res.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.replace(/\s+/g, " ").slice(0, 200);
    throw new Error(snippet || `Invalid response (${res.status})`);
  }
}
