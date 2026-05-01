import { NextResponse } from "next/server";
import type { DetailLevelId } from "@/lib/constants";
import { DETAIL_LEVELS } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  downloadOriginalBuffer,
  runPatternGeneration,
  uploadPreviewPng,
  type PatternSettings,
} from "@/lib/pattern-service";
import type { CropPercent } from "@/lib/pattern-engine";
import { difficultyLabel } from "@/lib/stitchability";

export const runtime = "nodejs";
export const maxDuration = 120;

function isDetailLevel(v: string): v is DetailLevelId {
  return v in DETAIL_LEVELS;
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    return await handleGet(ctx);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected server error";
    console.error("[GET /api/patterns/[id]]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleGet(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.from("patterns").select("*").eq("id", id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (data.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createServiceRoleClient();
  let previewUrl: string | null = null;
  if (data.preview_image_url) {
    const { data: signed } = await admin.storage
      .from("previews")
      .createSignedUrl(data.preview_image_url, 60 * 30);
    previewUrl = signed?.signedUrl ?? null;
  }

  const { data: colorRows } = await supabase
    .from("pattern_colors")
    .select("dmc_number, dmc_name, hex, stitch_count")
    .eq("pattern_id", id)
    .order("stitch_count", { ascending: false })
    .limit(12);

  const palettePreview =
    colorRows?.map((c) => ({
      dmcNumber: c.dmc_number,
      dmcName: c.dmc_name,
      hex: c.hex,
      stitchCount: c.stitch_count,
    })) ?? [];

  const score = typeof data.stitchability_score === "number" ? data.stitchability_score : 0;

  const { grid_json: _grid, ...safe } = data as Record<string, unknown> & { grid_json?: unknown };
  void _grid;
  return NextResponse.json({
    pattern: safe,
    previewUrl,
    palettePreview,
    stats: { difficultyLabel: difficultyLabel(score) },
  });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    return await handlePatch(request, ctx);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected server error";
    console.error("[PATCH /api/patterns/[id]]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handlePatch(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: row, error: loadErr } = await supabase.from("patterns").select("*").eq("id", id).maybeSingle();
  if (loadErr || !row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!row.original_image_url) {
    return NextResponse.json({ error: "Original image missing" }, { status: 400 });
  }

  const body = (await request.json()) as Partial<PatternSettings> & { title?: string };
  const title = (body.title ?? row.title ?? "My Pattern").toString().slice(0, 120);
  const crop = body.crop as CropPercent | undefined;
  const stitchWidth = body.stitchWidth ?? row.stitch_width_setting ?? 120;
  const detailLevel = (body.detailLevel as string) || row.difficulty_mode || "balanced";
  const fabricCount = body.fabricCount ?? row.fabric_count ?? 14;

  if (!crop || typeof crop.x !== "number") {
    return NextResponse.json({ error: "Crop is required" }, { status: 400 });
  }
  if (!isDetailLevel(detailLevel)) {
    return NextResponse.json({ error: "Invalid detail level" }, { status: 400 });
  }
  if (![14, 16, 18].includes(fabricCount)) {
    return NextResponse.json({ error: "Invalid fabric count" }, { status: 400 });
  }

  const settings: PatternSettings = {
    title,
    crop,
    stitchWidth: Number(stitchWidth),
    detailLevel,
    fabricCount: Number(fabricCount),
  };

  const admin = createServiceRoleClient();

  try {
    const original = await downloadOriginalBuffer(row.original_image_url as string);
    const pattern = await runPatternGeneration(original, settings);
    const previewPath = await uploadPreviewPng(id, pattern.previewPng);

    const gridPayload = {
      grid: pattern.grid,
      palette: pattern.palette,
      stitchWidth: pattern.stitchWidth,
      stitchHeight: pattern.stitchHeight,
      fabricCount: pattern.fabricCount,
      totalStitches: pattern.totalStitches,
      colorCount: pattern.colorCount,
      stitchabilityScore: pattern.stitchabilityScore,
      difficultyLabel: pattern.difficultyLabel,
      isolatedStitches: pattern.isolatedStitches,
      avgBlockSize: pattern.avgBlockSize,
    };

    const { error: upPatternErr } = await admin
      .from("patterns")
      .update({
        title: settings.title,
        preview_image_url: previewPath,
        stitch_width: pattern.stitchWidth,
        stitch_height: pattern.stitchHeight,
        fabric_count: settings.fabricCount,
        color_count: pattern.colorCount,
        difficulty_mode: settings.detailLevel,
        stitch_width_setting: settings.stitchWidth,
        total_stitches: pattern.totalStitches,
        stitchability_score: pattern.stitchabilityScore,
        crop: settings.crop as unknown as Record<string, number>,
        grid_json: gridPayload as unknown as Record<string, unknown>,
        generation_error: null,
      })
      .eq("id", id);

    if (upPatternErr) {
      return NextResponse.json({ error: upPatternErr.message }, { status: 500 });
    }

    await admin.from("pattern_colors").delete().eq("pattern_id", id);
    const colorRows = pattern.palette.map((c) => ({
      pattern_id: id,
      dmc_number: c.dmcNumber,
      dmc_name: c.dmcName,
      hex: c.hex,
      symbol: c.symbol,
      stitch_count: c.stitchCount,
      estimated_skeins: c.estimatedSkeins,
    }));
    if (colorRows.length) {
      const { error: colErr } = await admin.from("pattern_colors").insert(colorRows);
      if (colErr) {
        return NextResponse.json({ error: colErr.message }, { status: 500 });
      }
    }

    const { data: signed } = await admin.storage.from("previews").createSignedUrl(previewPath, 60 * 30);

    return NextResponse.json({
      previewUrl: signed?.signedUrl,
      stats: {
        stitchWidth: pattern.stitchWidth,
        stitchHeight: pattern.stitchHeight,
        colorCount: pattern.colorCount,
        totalStitches: pattern.totalStitches,
        stitchabilityScore: pattern.stitchabilityScore,
        difficultyLabel: pattern.difficultyLabel,
        fabricCount: settings.fabricCount,
      },
      palettePreview: pattern.palette.slice(0, 12),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    await admin.from("patterns").update({ generation_error: message }).eq("id", id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
