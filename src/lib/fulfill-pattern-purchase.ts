import { DOWNLOAD_EXPIRY_DAYS } from "@/lib/constants";
import {
  buildZipForPattern,
  downloadOriginalBufferForGeneration,
  hydratePatternFromSnapshot,
  uploadZipPackage,
  type PatternSettings,
} from "@/lib/pattern-service";
import { STORAGE_BUCKETS } from "@/lib/buckets";
import type { PatternResult } from "@/lib/pattern-engine";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FulfillPatternPurchaseInput = {
  patternId: string;
  /** Stored in orders.stripe_session_id for idempotency (e.g. Stripe cs_… or gumroad:…). */
  externalOrderId: string;
  amountCents: number;
  currency: string;
  paymentIntentId?: string | null;
};

export async function fulfillPatternPurchase(
  admin: SupabaseClient,
  input: FulfillPatternPurchaseInput,
): Promise<{ patternTitle: string; userId: string }> {
  const { patternId, externalOrderId, amountCents, currency, paymentIntentId } = input;

  const { data: existingOrder } = await admin
    .from("orders")
    .select("id")
    .eq("stripe_session_id", externalOrderId)
    .maybeSingle();
  if (existingOrder) {
    const { data: pattern } = await admin.from("patterns").select("title, user_id").eq("id", patternId).maybeSingle();
    if (!pattern) throw new Error("Pattern not found");
    return {
      patternTitle: String(pattern.title ?? "Your pattern"),
      userId: String(pattern.user_id),
    };
  }

  const { data: pattern, error: loadErr } = await admin.from("patterns").select("*").eq("id", patternId).maybeSingle();
  if (loadErr || !pattern) throw new Error("Pattern not found");

  const snap = pattern.grid_json as Record<string, unknown> | null;
  if (!snap || !Array.isArray(snap.grid) || !Array.isArray(snap.palette)) {
    throw new Error("Pattern snapshot missing — regenerate preview before purchase.");
  }

  if (!pattern.preview_image_url || !pattern.original_image_url) {
    throw new Error("Missing stored assets for this pattern.");
  }

  const prevFile = await admin.storage.from(STORAGE_BUCKETS.previews).download(pattern.preview_image_url as string);
  if (prevFile.error || !prevFile.data) throw new Error(prevFile.error?.message ?? "Preview download failed");
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
  const zipPath = await uploadZipPackage(patternId, zip);

  const expires = new Date();
  expires.setDate(expires.getDate() + DOWNLOAD_EXPIRY_DAYS);

  await admin
    .from("patterns")
    .update({
      payment_status: "paid",
      zip_file_url: zipPath,
      expires_at: expires.toISOString(),
      stripe_session_id: externalOrderId,
      generation_error: null,
    })
    .eq("id", patternId);

  await admin.from("orders").insert({
    user_id: pattern.user_id,
    pattern_id: patternId,
    stripe_session_id: externalOrderId,
    stripe_payment_intent: paymentIntentId ?? null,
    amount: amountCents,
    currency,
    status: "completed",
  });

  return {
    patternTitle: String(pattern.title ?? "Your pattern"),
    userId: String(pattern.user_id),
  };
}
