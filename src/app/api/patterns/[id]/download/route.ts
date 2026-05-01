import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSignedDownloadUrl } from "@/lib/pattern-service";
import { STORAGE_BUCKETS } from "@/lib/buckets";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: row, error } = await supabase.from("patterns").select("*").eq("id", id).maybeSingle();
  if (error || !row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (row.payment_status !== "paid" || !row.zip_file_url) {
    return NextResponse.json({ error: "Download not available yet." }, { status: 400 });
  }
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: "This download link has expired." }, { status: 410 });
  }

  const url = await createSignedDownloadUrl(STORAGE_BUCKETS.packages, row.zip_file_url as string, 60 * 10);
  return NextResponse.json({ url });
}
