import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/auth-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { STORAGE_BUCKETS } from "@/lib/buckets";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createServiceRoleClient();
  const { data: row } = await admin.from("patterns").select("*").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const paths: { bucket: string; path: string | null }[] = [
    { bucket: STORAGE_BUCKETS.originals, path: (row.original_image_url as string) ?? null },
    { bucket: STORAGE_BUCKETS.previews, path: (row.preview_image_url as string) ?? null },
    { bucket: STORAGE_BUCKETS.packages, path: (row.zip_file_url as string) ?? null },
  ];

  for (const p of paths) {
    if (!p.path) continue;
    await admin.storage.from(p.bucket).remove([p.path]);
  }

  await admin.from("pattern_colors").delete().eq("pattern_id", id);
  await admin.from("orders").delete().eq("pattern_id", id);
  await admin.from("patterns").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
