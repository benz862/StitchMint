import type { DetailLevelId } from "@/lib/constants";
import { generatePattern, type CropPercent, type PatternResult } from "@/lib/pattern-engine";
import { parseOverlayDraftForServer } from "@/lib/overlay-draft";
import type { TextOverlaySpec } from "@/lib/canvas-crop-text";
import { buildPatternZipArchive } from "@/lib/zip-package";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { STORAGE_BUCKETS } from "@/lib/buckets";
import sharp from "sharp";

export type PatternSettings = {
  title: string;
  crop: CropPercent;
  stitchWidth: number;
  detailLevel: DetailLevelId;
  fabricCount: number;
  /**
   * Optional explicit overlay spec — used by callers that don't carry a DB row, e.g. the admin
   * sample-pack builders. When `row` is also supplied to runPatternGeneration, the row's
   * overlay_draft wins (that's the "real" pattern's saved title); this only fills the gap when no
   * row exists.
   */
  overlay?: TextOverlaySpec | null;
};

export type PatternRowForGeneration = {
  original_image_url: string | null;
  overlay_draft?: unknown;
};

export async function downloadOriginalBuffer(path: string): Promise<Buffer> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage.from(STORAGE_BUCKETS.originals).download(path);
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to download original image");
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Returns the raw original raster. Overlay text is no longer merged here — generation merges it after
 * cropping so the overlay coordinates (% of crop frame) line up with what the user saw in the editor and
 * survive re-cropping on resume.
 */
export async function downloadOriginalBufferForGeneration(row: PatternRowForGeneration): Promise<Buffer> {
  if (!row.original_image_url) throw new Error("Original image path missing");
  return downloadOriginalBuffer(row.original_image_url as string);
}

export async function runPatternGeneration(
  originalBuffer: Buffer,
  settings: PatternSettings,
  row?: PatternRowForGeneration,
): Promise<PatternResult> {
  const rowOverlay = row ? parseOverlayDraftForServer(row.overlay_draft) : null;
  /**
   * Surface silent dropouts where the row carries an overlay_draft blob but it failed to parse
   * (wrong shape, missing version, empty text after trim) — the user would otherwise see a preview
   * with the title silently missing and no error to chase.
   */
  if (row?.overlay_draft && !rowOverlay) {
    console.warn("[pattern-service] overlay_draft present but parse returned null", {
      raw: row.overlay_draft,
    });
  }
  /** Row-derived overlay wins (saved by the customer); fall back to caller-provided settings.overlay (admin sample builder). */
  const overlaySpec = rowOverlay ?? settings.overlay ?? null;
  return generatePattern({
    imageBuffer: originalBuffer,
    crop: settings.crop,
    stitchWidth: settings.stitchWidth,
    detailLevel: settings.detailLevel,
    fabricCount: settings.fabricCount,
    enhance: settings.detailLevel === "expert",
    overlaySpec,
  });
}

export async function uploadPreviewPng(patternId: string, png: Buffer): Promise<string> {
  const supabase = createServiceRoleClient();
  const path = `${patternId}/preview.png`;
  const { error } = await supabase.storage.from(STORAGE_BUCKETS.previews).upload(path, png, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function uploadCompositionPng(patternId: string, png: Buffer): Promise<string> {
  const supabase = createServiceRoleClient();
  const path = `${patternId}/composition.png`;
  const { error } = await supabase.storage.from(STORAGE_BUCKETS.previews).upload(path, png, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function uploadZipPackage(patternId: string, zip: Buffer): Promise<string> {
  const supabase = createServiceRoleClient();
  const path = `${patternId}/StitchMint-Pattern.zip`;
  const { error } = await supabase.storage.from(STORAGE_BUCKETS.packages).upload(path, zip, {
    contentType: "application/zip",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function createSignedDownloadUrl(bucket: string, path: string, expiresSeconds = 3600) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresSeconds);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not sign download URL");
  return data.signedUrl;
}

export function hydratePatternFromSnapshot(
  snapshot: {
    grid: number[][];
    palette: PatternResult["palette"];
    stitchWidth: number;
    stitchHeight: number;
    fabricCount: number;
    totalStitches: number;
    colorCount: number;
    stitchabilityScore: number;
    difficultyLabel: string;
    isolatedStitches: number;
    avgBlockSize: number;
  },
  previewPng: Buffer,
): PatternResult {
  return {
    grid: snapshot.grid,
    palette: snapshot.palette,
    stitchWidth: snapshot.stitchWidth,
    stitchHeight: snapshot.stitchHeight,
    fabricCount: snapshot.fabricCount,
    previewPng,
    simulatedPng: previewPng,
    totalStitches: snapshot.totalStitches,
    colorCount: snapshot.colorCount,
    stitchabilityScore: snapshot.stitchabilityScore,
    difficultyLabel: snapshot.difficultyLabel,
    isolatedStitches: snapshot.isolatedStitches,
    avgBlockSize: snapshot.avgBlockSize,
  };
}

export async function buildZipForPattern(
  originalBuffer: Buffer,
  settings: PatternSettings,
  pattern: PatternResult,
): Promise<Buffer> {
  /**
   * Prefer the WYSIWYG composition (cropped + overlay text baked in, pre-quantization) for the
   * "Your photo" thumb on the PDF cover. The stitched preview on the right is necessarily a tiny
   * quantized DMC grid where small titles vanish, so without this the user's composed title
   * disappears from every PDF in the pack — looks like the overlay never made it through.
   *
   * Fall back to a thumb of the raw uncropped original only when no composition was generated
   * (e.g. resumed from a snapshot that predates compositionPng).
   */
  const sourceForThumb: Buffer = pattern.compositionPng ?? originalBuffer;
  let originalThumb: Buffer | undefined;
  try {
    originalThumb = await sharp(sourceForThumb)
      .rotate()
      .resize({ width: 400, height: 400, fit: "inside" })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    originalThumb = undefined;
  }
  return buildPatternZipArchive({
    title: settings.title,
    pattern,
    originalImage: originalThumb,
  });
}
