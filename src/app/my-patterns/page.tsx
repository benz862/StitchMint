import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PatternDownloadButton } from "@/components/PatternDownloadButton";

export const dynamic = "force-dynamic";

export default async function MyPatternsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: rawQuery } = await searchParams;
  const query = rawQuery?.trim().slice(0, 120) ?? "";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/my-patterns");
  }

  let patternsQuery = supabase
    .from("patterns")
    .select("id,title,created_at,payment_status,stitch_width,stitch_height,color_count")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (query) patternsQuery = patternsQuery.ilike("title", `%${query.replace(/[%_]/g, "\\$&")}%`);
  const { data: patterns } = await patternsQuery;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="font-serif text-3xl text-ink sm:text-4xl">My patterns</h1>
      <p className="mt-3 text-sm text-muted">Every pattern you start or purchase lives here.</p>
      <form className="mt-6 flex gap-2" action="/my-patterns">
        <input name="q" defaultValue={query} placeholder="Search pattern names" className="w-full rounded-full border border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink" />
        <button className="rounded-full bg-ink px-4 py-2 text-sm text-cream">Search</button>
      </form>

      <div className="mt-10 space-y-4">
        {(patterns ?? []).length === 0 && <p className="text-sm text-muted">No patterns yet.</p>}
        {(patterns ?? []).map((p) => (
          <div key={p.id} className="flex flex-col gap-3 rounded-3xl border border-line bg-card/90 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-ink">{p.title ?? "Untitled pattern"}</p>
              <p className="mt-1 text-xs text-muted">
                {p.stitch_width}×{p.stitch_height} stitches · {p.color_count} colors ·{" "}
                {p.payment_status === "paid" ? "Unlocked" : "Preview"}
              </p>
            </div>
            <div className="flex gap-2">
              <Link href={`/preview/${p.id}`} className="rounded-full border border-line px-4 py-2 text-sm hover:bg-cream-deep/70">
                Open
              </Link>
              {p.payment_status === "paid" ? <PatternDownloadButton patternId={p.id} /> : null}
            </div>
          </div>
        ))}
      </div>

      <Link href="/create" className="mt-10 inline-block text-sm text-ink underline">
        Create another pattern
      </Link>
    </div>
  );
}
