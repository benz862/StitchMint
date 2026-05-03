import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { DOWNLOAD_EXPIRY_DAYS } from "@/lib/constants";
import { getStripe } from "@/lib/stripe";
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
import { sendPatternReadyEmail } from "@/lib/purchase-email";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
  }

  const stripe = getStripe();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const patternId = session.metadata?.patternId ?? session.client_reference_id;
  if (!patternId) {
    return NextResponse.json({ error: "Missing pattern id" }, { status: 400 });
  }

  const admin = createServiceRoleClient();

  const { data: existingOrder } = await admin.from("orders").select("id").eq("stripe_session_id", session.id).maybeSingle();
  if (existingOrder) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const { data: pattern, error: loadErr } = await admin.from("patterns").select("*").eq("id", patternId).maybeSingle();
  if (loadErr || !pattern) {
    return NextResponse.json({ error: "Pattern not found" }, { status: 404 });
  }

  const amount = session.amount_total ?? 0;
  const currency = session.currency ?? "usd";

  try {
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
    const crop = pattern.crop as PatternSettings["crop"];
    const settings: PatternSettings = {
      title: String(pattern.title ?? "My Pattern"),
      crop,
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
        stripe_session_id: session.id,
        generation_error: null,
      })
      .eq("id", patternId);

    const pi =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent && "id" in session.payment_intent
          ? session.payment_intent.id
          : null;

    await admin.from("orders").insert({
      user_id: pattern.user_id,
      pattern_id: patternId,
      stripe_session_id: session.id,
      stripe_payment_intent: pi,
      amount,
      currency,
      status: "completed",
    });

    let profileEmail: string | null = null;
    const { data: prof } = await admin.from("profiles").select("email").eq("id", pattern.user_id).maybeSingle();
    if (prof?.email && typeof prof.email === "string") profileEmail = prof.email;

    try {
      await sendPatternReadyEmail({
        session,
        patternId,
        patternTitle: String(pattern.title ?? "Your pattern"),
        fallbackEmail: profileEmail,
      });
    } catch (emailErr) {
      console.error("[webhook/stripe] Purchase email failed (order still completed)", emailErr);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Fulfillment error";
    await admin.from("patterns").update({ generation_error: message }).eq("id", patternId);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
