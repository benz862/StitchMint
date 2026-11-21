import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import sharp from "sharp";
import { STORAGE_BUCKETS } from "@/lib/buckets";
import { buildAllSizesPatternZip } from "@/lib/owner-export";
import type { CropPercent } from "@/lib/pattern-engine";
import {
  buildZipForPattern,
  createSignedDownloadUrl,
  downloadOriginalBuffer,
  type PatternSettings,
} from "@/lib/pattern-service";
import { runPatternGeneration } from "@/lib/pattern-service";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Batch Produce (admin) — server-side state + generation.
 *
 * State lives in a JSON manifest in the `packages` bucket (no DB table / migration needed):
 *   {adminUserId}/__batch__/{batchId}/manifest.json
 * Originals are uploaded by the browser straight to the `originals` bucket (same direct-to-storage
 * mechanism as the create flow, so no large request body ever passes through a route handler):
 *   {adminUserId}/__batch__/{batchId}/{itemId}/original.{ext}
 * Finished per-design ZIPs land next to the manifest:
 *   {adminUserId}/__batch__/{batchId}/{itemId}.zip
 * Every path's first segment is the admin's user id, matching the storage policies in
 * supabase/migrations/002_storage_buckets.sql. All manifest/ZIP access here uses the service role.
 */

export const BATCH_MAX_ITEMS = 20;
export const BATCH_MODES = ["large", "mini", "combo", "bookmark"] as const;
export type BatchMode = (typeof BATCH_MODES)[number];
export const BATCH_CROPS = ["square", "full"] as const;
export type BatchCrop = (typeof BATCH_CROPS)[number];
export const BATCH_FABRIC_COUNTS = [12, 16, 18] as const;
export type BatchFabricCount = (typeof BATCH_FABRIC_COUNTS)[number];

export type BatchSettings = {
  mode: BatchMode;
  crop: BatchCrop;
  fabricCount: BatchFabricCount;
};

export type BatchItemStatus = "queued" | "working" | "done" | "failed";

export type BatchItem = {
  id: string;
  title: string;
  originalPath: string;
  status: BatchItemStatus;
  outputPath: string | null;
  outputFilename: string | null;
  error: string | null;
};

export type BatchManifest = {
  version: 1;
  id: string;
  ownerUserId: string;
  createdAt: string;
  settings: BatchSettings;
  items: BatchItem[];
};

/** Same sanitizer the owner export-all route uses for download filenames. */
export function safeFilenamePart(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "StitchMint Pattern";
}

export function batchOutputFilename(title: string, mode: BatchMode): string {
  const suffix =
    mode === "large" ? "All Sizes" : mode === "mini" ? "Mini" : mode === "bookmark" ? "Bookmark" : "Combo";
  return `${safeFilenamePart(title)} - ${suffix}.zip`;
}

export function batchDir(adminUserId: string, batchId: string): string {
  return `${adminUserId}/__batch__/${batchId}`;
}

export function batchManifestPath(adminUserId: string, batchId: string): string {
  return `${batchDir(adminUserId, batchId)}/manifest.json`;
}

export function batchOriginalPath(adminUserId: string, batchId: string, itemId: string, ext: string): string {
  return `${batchDir(adminUserId, batchId)}/${itemId}/original.${ext}`;
}

export function batchItemOutputPath(adminUserId: string, batchId: string, itemId: string): string {
  return `${batchDir(adminUserId, batchId)}/${itemId}.zip`;
}

export function isBatchId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function newBatchId(): string {
  return randomUUID();
}

export function validateBatchSettings(raw: unknown): BatchSettings {
  if (!raw || typeof raw !== "object") throw new Error("settings must be an object");
  const o = raw as Record<string, unknown>;
  if (!(BATCH_MODES as readonly string[]).includes(String(o.mode))) {
    throw new Error(`settings.mode must be one of ${BATCH_MODES.join(", ")}`);
  }
  if (!(BATCH_CROPS as readonly string[]).includes(String(o.crop))) {
    throw new Error(`settings.crop must be one of ${BATCH_CROPS.join(", ")}`);
  }
  if (!(BATCH_FABRIC_COUNTS as readonly number[]).includes(Number(o.fabricCount))) {
    throw new Error(`settings.fabricCount must be one of ${BATCH_FABRIC_COUNTS.join(", ")}`);
  }
  return {
    mode: o.mode as BatchMode,
    crop: o.crop as BatchCrop,
    fabricCount: Number(o.fabricCount) as BatchFabricCount,
  };
}

export async function readBatchManifest(adminUserId: string, batchId: string): Promise<BatchManifest | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.storage
    .from(STORAGE_BUCKETS.packages)
    .download(batchManifestPath(adminUserId, batchId));
  if (error || !data) return null;
  try {
    const parsed = JSON.parse(await data.text()) as BatchManifest;
    if (parsed?.version !== 1 || parsed.id !== batchId || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeBatchManifest(manifest: BatchManifest): Promise<void> {
  const admin = createServiceRoleClient();
  const body = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  const { error } = await admin.storage
    .from(STORAGE_BUCKETS.packages)
    .upload(batchManifestPath(manifest.ownerUserId, manifest.id), body, {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw new Error(error.message);
}

/** List this admin's batch ids, newest first (folder names under `{uid}/__batch__/`). */
export async function listBatchIds(adminUserId: string): Promise<string[]> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.storage
    .from(STORAGE_BUCKETS.packages)
    .list(`${adminUserId}/__batch__`, { limit: 100 });
  if (error || !data) return [];
  return data.map((e) => e.name).filter((name) => isBatchId(name));
}

/**
 * Resolve the batch's crop + aspect ratio from the stored original's real pixel size.
 * "square" = centered 1:1 crop; "full" = the whole image at its natural aspect.
 */
export async function resolveBatchCrop(
  originalBuffer: Buffer,
  cropMode: BatchCrop,
): Promise<{ crop: CropPercent; aspectRatio: number }> {
  if (cropMode === "full") {
    const meta = await sharp(originalBuffer).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    return {
      crop: { x: 0, y: 0, width: 100, height: 100 },
      aspectRatio: w > 0 && h > 0 ? w / h : 1,
    };
  }
  const meta = await sharp(originalBuffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h || w === h) {
    return { crop: { x: 0, y: 0, width: 100, height: 100 }, aspectRatio: 1 };
  }
  if (w > h) {
    const widthPct = (h / w) * 100;
    return { crop: { x: (100 - widthPct) / 2, y: 0, width: widthPct, height: 100 }, aspectRatio: 1 };
  }
  const heightPct = (w / h) * 100;
  return { crop: { x: 0, y: (100 - heightPct) / 2, width: 100, height: heightPct }, aspectRatio: 1 };
}

/** The Mini run: 64 stitches wide, beginner detail level (palette cap 15 — see DETAIL_LEVELS). */
export const MINI_ENGINE = { stitchWidth: 64, detailLevel: "beginner" } as const;
export const MINI_FOLDER = "Mini-64x64";

async function buildMiniZip(
  originalBuffer: Buffer,
  title: string,
  crop: CropPercent,
  aspectRatio: number,
  fabricCount: number,
): Promise<Buffer> {
  const settings: PatternSettings = {
    title: `${title} — Mini`,
    crop,
    aspectRatio,
    stitchWidth: MINI_ENGINE.stitchWidth,
    detailLevel: MINI_ENGINE.detailLevel,
    fabricCount,
  };
  const pattern = await runPatternGeneration(originalBuffer, settings);
  return buildZipForPattern(originalBuffer, settings, pattern);
}

/**
 * The Bookmark run: 32 stitches wide × 96 tall (2" × 6" on 16-count), beginner detail level
 * (palette cap 15 — see DETAIL_LEVELS). The grid height is exact, not aspect-derived by the
 * caller: the engine computes stitchHeight = round(stitchWidth / aspectRatio), and the
 * bookmark always passes aspectRatio = 32/96, so every bookmark lands at exactly 32 × 96
 * regardless of the source image's shape.
 */
export const BOOKMARK_ENGINE = { stitchWidth: 32, stitchHeight: 96, detailLevel: "beginner" } as const;

/**
 * Resolve the bookmark's centered 1:3 crop frame (width:height = 1:3) from the stored
 * original's real pixel size — the same percent-crop math as resolveBatchCrop's square
 * branch, with a 1:3 target frame instead of 1:1. A source already at 1:3 keeps the whole
 * image; a square source yields its centered vertical third; a wider source a centered
 * vertical slice; a taller source a centered horizontal band.
 */
export async function resolveBookmarkCrop(
  originalBuffer: Buffer,
): Promise<{ crop: CropPercent; aspectRatio: number }> {
  const aspectRatio = BOOKMARK_ENGINE.stitchWidth / BOOKMARK_ENGINE.stitchHeight;
  const meta = await sharp(originalBuffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) {
    return { crop: { x: 0, y: 0, width: 100, height: 100 }, aspectRatio };
  }
  const imageRatio = w / h;
  if (Math.abs(imageRatio - aspectRatio) < 1e-9) {
    return { crop: { x: 0, y: 0, width: 100, height: 100 }, aspectRatio };
  }
  if (imageRatio > aspectRatio) {
    const widthPct = ((h * aspectRatio) / w) * 100;
    return { crop: { x: (100 - widthPct) / 2, y: 0, width: widthPct, height: 100 }, aspectRatio };
  }
  const heightPct = ((w / aspectRatio) / h) * 100;
  return { crop: { x: 0, y: (100 - heightPct) / 2, width: 100, height: heightPct }, aspectRatio };
}

/** The Bookmark run, built exactly like the Mini run but on the fixed 32 × 96 grid. */
async function buildBookmarkZip(
  originalBuffer: Buffer,
  title: string,
  fabricCount: number,
): Promise<Buffer> {
  const { crop, aspectRatio } = await resolveBookmarkCrop(originalBuffer);
  const settings: PatternSettings = {
    title: `${title} — Bookmark`,
    crop,
    aspectRatio,
    stitchWidth: BOOKMARK_ENGINE.stitchWidth,
    detailLevel: BOOKMARK_ENGINE.detailLevel,
    fabricCount,
  };
  const pattern = await runPatternGeneration(originalBuffer, settings);
  return buildZipForPattern(originalBuffer, settings, pattern);
}

/** Build the finished per-design ZIP for one batch item, per the batch mode. */
export async function buildBatchItemZip(
  originalBuffer: Buffer,
  settings: BatchSettings,
  title: string,
): Promise<Buffer> {
  if (settings.mode === "bookmark") {
    /** Bookmarks ignore the batch crop setting — they always use the centered 1:3 frame. */
    return buildBookmarkZip(originalBuffer, title, settings.fabricCount);
  }

  const { crop, aspectRatio } = await resolveBatchCrop(originalBuffer, settings.crop);

  if (settings.mode === "mini") {
    return buildMiniZip(originalBuffer, title, crop, aspectRatio, settings.fabricCount);
  }

  const allSizes = await buildAllSizesPatternZip({
    originalBuffer,
    title,
    crop,
    aspectRatio,
    fabricCount: settings.fabricCount,
  });
  if (settings.mode === "large") return allSizes;

  /** Combo: the All Sizes folders plus the Mini run's ZIP contents under Mini-64x64/. */
  const miniZip = await buildMiniZip(originalBuffer, title, crop, aspectRatio, settings.fabricCount);
  const outer = await JSZip.loadAsync(allSizes);
  const mini = await JSZip.loadAsync(miniZip);
  const folder = outer.folder(MINI_FOLDER);
  if (!folder) throw new Error("Could not create Mini folder in combo ZIP");
  for (const entry of Object.values(mini.files)) {
    if (entry.dir) continue;
    folder.file(entry.name, await entry.async("nodebuffer"));
  }
  return outer.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/**
 * Process one item end to end: mark working, generate, store the ZIP, mark done/failed.
 * Always persists the outcome to the manifest and returns the updated item.
 */
export async function processBatchItem(manifest: BatchManifest, itemId: string): Promise<BatchItem> {
  const item = manifest.items.find((i) => i.id === itemId);
  if (!item) throw new Error("Item not found in batch");
  if (item.status === "done" && item.outputPath) return item;

  item.status = "working";
  item.error = null;
  await writeBatchManifest(manifest);

  try {
    const original = await downloadOriginalBuffer(item.originalPath);
    const zip = await buildBatchItemZip(original, manifest.settings, item.title);
    const outputPath = batchItemOutputPath(manifest.ownerUserId, manifest.id, item.id);
    const admin = createServiceRoleClient();
    const { error } = await admin.storage.from(STORAGE_BUCKETS.packages).upload(outputPath, zip, {
      contentType: "application/zip",
      upsert: true,
    });
    if (error) throw new Error(error.message);
    item.status = "done";
    item.outputPath = outputPath;
    item.outputFilename = batchOutputFilename(item.title, manifest.settings.mode);
    item.error = null;
  } catch (err) {
    item.status = "failed";
    item.error = err instanceof Error ? err.message : String(err);
  }
  await writeBatchManifest(manifest);
  return item;
}

/** Signed download URL for a finished item ZIP (15 minutes, matching the admin demo flow). */
export async function signBatchItemDownload(item: BatchItem): Promise<string | null> {
  if (item.status !== "done" || !item.outputPath) return null;
  try {
    return await createSignedDownloadUrl(STORAGE_BUCKETS.packages, item.outputPath, 60 * 15);
  } catch {
    return null;
  }
}

/** Assemble every finished item ZIP into one outer ZIP, store it, and return a signed URL. */
export async function buildBatchDownloadAll(
  manifest: BatchManifest,
): Promise<{ url: string; filename: string }> {
  const done = manifest.items.filter((i) => i.status === "done" && i.outputPath);
  if (!done.length) throw new Error("No finished items to download yet");
  const admin = createServiceRoleClient();
  const outer = new JSZip();
  const usedNames = new Set<string>();
  for (const item of done) {
    const { data, error } = await admin.storage
      .from(STORAGE_BUCKETS.packages)
      .download(item.outputPath as string);
    if (error || !data) throw new Error(`Could not read finished ZIP for "${item.title}"`);
    let name = item.outputFilename ?? batchOutputFilename(item.title, manifest.settings.mode);
    if (usedNames.has(name)) {
      let n = 2;
      while (usedNames.has(name.replace(/\.zip$/i, ` ${n}.zip`))) n += 1;
      name = name.replace(/\.zip$/i, ` ${n}.zip`);
    }
    usedNames.add(name);
    outer.file(name, Buffer.from(await data.arrayBuffer()));
  }
  const zip = await outer.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const date = manifest.createdAt.slice(0, 10);
  // Name the download after what is inside: when every finished item shares
  // one base title (trailing variant numbers stripped), the ZIP is called
  // "<Base> Patterns.zip" — a batch of Bluebonnet 1-4 downloads as
  // "Bluebonnet Patterns.zip". Mixed batches keep the dated batch name.
  const baseOf = (t: string) => t.replace(/\s+\d+\s*$/, "").trim();
  const bases = new Set(done.map((i) => baseOf(i.title)));
  const sharedBase = bases.size === 1 ? [...bases][0] : "";
  const filename = sharedBase
    ? `${safeFilenamePart(sharedBase)} Patterns.zip`
    : `StitchMint-Batch-${date}.zip`;
  const path = `${batchDir(manifest.ownerUserId, manifest.id)}/__all__/${filename}`;
  const { error } = await admin.storage.from(STORAGE_BUCKETS.packages).upload(path, zip, {
    contentType: "application/zip",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  const url = await createSignedDownloadUrl(STORAGE_BUCKETS.packages, path, 60 * 15);
  return { url, filename };
}
