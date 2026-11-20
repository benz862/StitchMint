import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/auth-admin";
import { isBatchId, readBatchManifest, signBatchItemDownload } from "@/lib/batch-produce";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Read one batch's manifest, with fresh signed download URLs attached to finished items. */
export async function GET(_request: Request, ctx: { params: Promise<{ batchId: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { batchId } = await ctx.params;
  if (!isBatchId(batchId)) {
    return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
  }

  const manifest = await readBatchManifest(user.id, batchId);
  if (!manifest || manifest.ownerUserId !== user.id) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const items = await Promise.all(
    manifest.items.map(async (item) => ({ ...item, downloadUrl: await signBatchItemDownload(item) })),
  );
  return NextResponse.json(
    { batch: { ...manifest, items } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
