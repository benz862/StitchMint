import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/auth-admin";
import {
  BATCH_MAX_ITEMS,
  batchDir,
  isBatchId,
  listBatchIds,
  readBatchManifest,
  validateBatchSettings,
  writeBatchManifest,
  type BatchItem,
  type BatchManifest,
} from "@/lib/batch-produce";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

async function requireAdmin(): Promise<{ userId: string; email: string } | NextResponse> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { userId: user.id, email: user.email };
}

/** List this admin's batches (summaries) so the Batch Produce page can resume after a refresh. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  try {
    const ids = await listBatchIds(auth.userId);
    const batches: Array<{
      id: string;
      createdAt: string;
      settings: BatchManifest["settings"];
      counts: Record<BatchItem["status"], number>;
    }> = [];
    for (const id of ids) {
      const manifest = await readBatchManifest(auth.userId, id);
      if (!manifest) continue;
      const counts: Record<BatchItem["status"], number> = { queued: 0, working: 0, done: 0, failed: 0 };
      for (const item of manifest.items) counts[item.status] += 1;
      batches.push({ id: manifest.id, createdAt: manifest.createdAt, settings: manifest.settings, counts });
    }
    batches.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return NextResponse.json({ batches }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not list batches" },
      { status: 500 },
    );
  }
}

/**
 * Create a batch. The browser has already uploaded each original directly to the `originals`
 * bucket (per-file, so no request body cap applies); this call only registers the manifest.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  const o = (body ?? {}) as Record<string, unknown>;

  const batchId = String(o.id ?? "");
  if (!isBatchId(batchId)) {
    return NextResponse.json({ error: "A valid batch id is required" }, { status: 400 });
  }

  let settings;
  try {
    settings = validateBatchSettings(o.settings);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid settings" }, { status: 400 });
  }

  const rawItems = Array.isArray(o.items) ? o.items : [];
  if (!rawItems.length) {
    return NextResponse.json({ error: "Add at least one image" }, { status: 400 });
  }
  if (rawItems.length > BATCH_MAX_ITEMS) {
    return NextResponse.json({ error: `A batch holds at most ${BATCH_MAX_ITEMS} images` }, { status: 400 });
  }

  const prefix = `${batchDir(auth.userId, batchId)}/`;
  const items: BatchItem[] = [];
  const seenIds = new Set<string>();
  for (const raw of rawItems) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const id = String(r.id ?? "");
    const title = String(r.title ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const originalPath = String(r.originalPath ?? "");
    if (!isBatchId(id) || seenIds.has(id)) {
      return NextResponse.json({ error: "Each item needs a unique valid id" }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "Each item needs a title" }, { status: 400 });
    }
    if (!originalPath.startsWith(prefix) || !originalPath.includes("/original.")) {
      return NextResponse.json({ error: "An item's original path does not belong to this batch" }, { status: 400 });
    }
    seenIds.add(id);
    items.push({ id, title, originalPath, status: "queued", outputPath: null, outputFilename: null, error: null });
  }

  const existing = await readBatchManifest(auth.userId, batchId);
  if (existing) {
    return NextResponse.json({ error: "This batch already exists" }, { status: 409 });
  }

  const manifest: BatchManifest = {
    version: 1,
    id: batchId,
    ownerUserId: auth.userId,
    createdAt: new Date().toISOString(),
    settings,
    items,
  };
  try {
    await writeBatchManifest(manifest);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the batch" },
      { status: 500 },
    );
  }
  return NextResponse.json({ batch: manifest }, { headers: { "Cache-Control": "no-store" } });
}
