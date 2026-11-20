import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/auth-admin";
import {
  isBatchId,
  processBatchItem,
  readBatchManifest,
  signBatchItemDownload,
} from "@/lib/batch-produce";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Generate ONE batch item (the client drives the queue item by item, so no single request
 * ever has to produce more than one design). Returns the updated item, with a signed
 * download URL when it finished.
 */
export async function POST(request: Request, ctx: { params: Promise<{ batchId: string }> }) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  const itemId = String(((body ?? {}) as Record<string, unknown>).itemId ?? "");
  if (!isBatchId(itemId)) {
    return NextResponse.json({ error: "A valid itemId is required" }, { status: 400 });
  }

  const manifest = await readBatchManifest(user.id, batchId);
  if (!manifest || manifest.ownerUserId !== user.id) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  if (!manifest.items.some((i) => i.id === itemId)) {
    return NextResponse.json({ error: "Item not found in batch" }, { status: 404 });
  }

  try {
    const item = await processBatchItem(manifest, itemId);
    return NextResponse.json(
      { item: { ...item, downloadUrl: await signBatchItemDownload(item) } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Processing failed" },
      { status: 500 },
    );
  }
}
