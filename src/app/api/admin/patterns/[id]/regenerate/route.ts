import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/auth-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  buildZipForPattern,
  downloadOriginalBufferForGeneration,
  hydratePatternFromSnapshot,
  uploadZipPackage,
  type PatternSettings,
} from "@/lib/pattern-service";
import { STORAGE_BUCKETS } from "@/lib/buckets";
import type { PatternResult } from "@/lib/pattern-engine";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createServiceRoleClient();
  const { data: pattern, error } = await admin.from("patterns").select("*").eq("id", id).maybeSingle();
  if (error || !pattern) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const snap = pattern.grid_json as Record<string, unknown> | null;
  if (!snap || !Array.isArray(snap.grid) || !Array.isArray(snap.palette)) {
    return NextResponse.json({ error: "Missing grid snapshot" }, { status: 400 });
  }
  if (!pattern.preview_image_url || !pattern.original_image_url) {
    return NextResponse.json({ error: "Missing assets" }, { status: 400 });
  }

  const prevFile = await admin.storage.from(STORAGE_BUCKETS.previews).download(pattern.preview_image_url as string);
  if (prevFile.error || !prevFile.data) {
    return NextResponse.json({ error: prevFile.error?.message ?? "Preview download failed" }, { status: 400 });
  }
  const previewPng = Buffer.from(await prevFile.data.arrayBuffer());

  const hydrated = hydratePatternFromSnapshot(
    {
      grid: snap.grid as number[][],
      palette: snap.palette as PatternResult["palette"],
      stitchWidth: Number(snap.stitchWidth),
      stitchHeight: Number(snap.stitchHeight),
      fabricCount: Number(snap.fabricCount),
      totalStitches: Number(snap.totalStitches),
      colorCount: Number(snap.colorCount),
      stitchabilityScore: Number(snap.stitchabilityScore),
      difficultyLabel: String(snap.difficultyLabel),
      isolatedStitches: Number(snap.isolatedStitches),
      avgBlockSize: Number(snap.avgBlockSize),
    },
    previewPng,
  );

  const original = await downloadOriginalBufferForGeneration(pattern as { original_image_url: string; overlay_draft?: unknown });
  const settings: PatternSettings = {
    title: String(pattern.title ?? "My Pattern"),
    crop: pattern.crop as PatternSettings["crop"],
    stitchWidth: Number(pattern.stitch_width_setting ?? pattern.stitch_width ?? 120),
    detailLevel: (pattern.difficulty_mode as PatternSettings["detailLevel"]) ?? "balanced",
    fabricCount: Number(pattern.fabric_count ?? 14),
  };

  const zip = await buildZipForPattern(original, settings, hydrated);
  const zipPath = await uploadZipPackage(id, zip);
  await admin.from("patterns").update({ zip_file_url: zipPath, generation_error: null }).eq("id", id);

  return NextResponse.json({ ok: true, zipPath });
}
