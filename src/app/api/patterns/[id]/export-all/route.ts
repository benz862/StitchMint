import { NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/auth-owner";
import type { CropPercent } from "@/lib/pattern-engine";
import { buildAllSizesPatternZip } from "@/lib/owner-export";
import { downloadOriginalBufferForGeneration, type PatternRowForGeneration } from "@/lib/pattern-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

function isCropPercent(value: unknown): value is CropPercent {
  if (!value || typeof value !== "object") return false;
  const crop = value as Record<string, unknown>;
  return ["x", "y", "width", "height"].every(
    (key) => typeof crop[key] === "number" && Number.isFinite(crop[key]),
  );
}

function safeFilenamePart(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "StitchMint Pattern";
}

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isOwnerEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: row, error } = await supabase.from("patterns").select("*").eq("id", id).maybeSingle();
    if (error || !row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (row.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!row.original_image_url) {
      return NextResponse.json({ error: "Original image missing" }, { status: 400 });
    }
    if (!isCropPercent(row.crop)) {
      return NextResponse.json(
        { error: "Generate a preview before exporting all sizes." },
        { status: 400 },
      );
    }

    const generationRow = row as PatternRowForGeneration & { original_image_url: string };
    const original = await downloadOriginalBufferForGeneration(generationRow);
    const currentWidth = Number(row.stitch_width);
    const currentHeight = Number(row.stitch_height);
    const aspectRatio =
      Number.isFinite(currentWidth) && Number.isFinite(currentHeight) && currentWidth > 0 && currentHeight > 0
        ? currentWidth / currentHeight
        : undefined;

    const zip = await buildAllSizesPatternZip({
      originalBuffer: original,
      title: String(row.title ?? "My Pattern"),
      crop: row.crop,
      aspectRatio,
      fabricCount: Number(row.fabric_count ?? 14),
      row: generationRow,
    });

    const filename = `${safeFilenamePart(String(row.title ?? "StitchMint Pattern"))} - All Sizes.zip`;
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(zip.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed";
    console.error("[POST /api/patterns/[id]/export-all]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
