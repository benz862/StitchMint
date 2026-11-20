import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/auth-admin";
import { buildBatchDownloadAll, isBatchId, readBatchManifest } from "@/lib/batch-produce";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Assemble one outer ZIP from the batch's finished item ZIPs. The outer ZIP is stored in
 * Supabase and returned as a signed URL (same pattern as the admin demo pack) so large
 * batches never stream through this host's response body limit.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ batchId: string }> }) {
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

  try {
    const { url, filename } = await buildBatchDownloadAll(manifest);
    return NextResponse.json({ url, filename }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not assemble the batch ZIP" },
      { status: 500 },
    );
  }
}
