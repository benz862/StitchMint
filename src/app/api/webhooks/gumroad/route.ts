import { NextResponse } from "next/server";
import { getPricingTierById } from "@/config/pricing";
import { pricingTierFromGumroadPermalink } from "@/config/gumroad-checkout";
import { getPricingTierIdFromPatternRow } from "@/lib/pricing-checkout";
import { fulfillPatternPurchase } from "@/lib/fulfill-pattern-purchase";
import {
  gumroadPriceCents,
  gumroadSaleExternalId,
  isGumroadRefund,
  parseGumroadPingBody,
  patternIdFromGumroadPing,
} from "@/lib/gumroad-ping";
import { sendPatternReadyEmailToAddress } from "@/lib/purchase-email";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 300;

async function buyerEmailMatchesPatternOwner(
  admin: ReturnType<typeof createServiceRoleClient>,
  patternUserId: string | null,
  buyerEmail: string,
): Promise<boolean> {
  if (!patternUserId || !buyerEmail.trim()) return false;
  const { data: prof } = await admin.from("profiles").select("email").eq("id", patternUserId).maybeSingle();
  const owner = typeof prof?.email === "string" ? prof.email.trim().toLowerCase() : "";
  return owner.length > 0 && owner === buyerEmail.trim().toLowerCase();
}

export async function POST(request: Request) {
  const bodyText = await request.text();
  const body = parseGumroadPingBody(bodyText);

  if (isGumroadRefund(body)) {
    return NextResponse.json({ received: true, skipped: "refund" });
  }

  if (body.is_gift_receiver_purchase === "true" || body.is_gift_sender_purchase === "true") {
    console.warn("[webhook/gumroad] Gift purchase — StitchMint ties patterns to the buyer account that created them", {
      is_gift_receiver: body.is_gift_receiver_purchase,
      is_gift_sender: body.is_gift_sender_purchase,
      email: body.email,
    });
    return NextResponse.json(
      {
        error:
          "Gift purchases are not supported for auto-delivery. Buy on Gumroad without “Give as a gift,” using the same email as your StitchMint account.",
      },
      { status: 400 },
    );
  }

  const saleId = body.sale_id?.trim();
  if (!saleId) {
    return NextResponse.json({ error: "Missing sale_id" }, { status: 400 });
  }

  const patternId = patternIdFromGumroadPing(body);
  if (!patternId) {
    return NextResponse.json({ error: "Missing or invalid checkout token (st) from Gumroad Ping" }, { status: 400 });
  }

  const buyerEmail = body.email?.trim() ?? "";
  if (!buyerEmail) {
    return NextResponse.json({ error: "Missing buyer email" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data: pattern, error: loadErr } = await admin.from("patterns").select("*").eq("id", patternId).maybeSingle();
  if (loadErr || !pattern) {
    return NextResponse.json({ error: "Pattern not found" }, { status: 404 });
  }

  const owns = await buyerEmailMatchesPatternOwner(admin, pattern.user_id as string | null, buyerEmail);
  if (!owns) {
    console.warn("[webhook/gumroad] Buyer email does not match pattern owner", { patternId, buyerEmail });
    return NextResponse.json(
      { error: "Purchase email must match your StitchMint account email for this pattern." },
      { status: 403 },
    );
  }

  if (String(pattern.payment_status ?? "") === "paid") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (!pattern.preview_image_url) {
    return NextResponse.json({ error: "Pattern has no preview — cannot fulfill." }, { status: 400 });
  }

  const purchasedTier = pricingTierFromGumroadPermalink(body.permalink);
  const tierId = getPricingTierIdFromPatternRow(pattern);
  if (purchasedTier && purchasedTier !== tierId) {
    console.warn("[webhook/gumroad] Gumroad product does not match pattern tier", {
      patternId,
      purchasedTier,
      tierId,
      permalink: body.permalink,
    });
    return NextResponse.json({ error: "Purchased product does not match this pattern's tier." }, { status: 400 });
  }

  const tier = getPricingTierById(tierId);
  const expectedCents = tier?.priceCents ?? 0;
  const paidCents = gumroadPriceCents(body);
  if (expectedCents > 0 && paidCents > 0 && paidCents < expectedCents) {
    console.warn("[webhook/gumroad] Paid amount below tier price", { patternId, paidCents, expectedCents, tierId });
    return NextResponse.json({ error: "Payment amount does not match pattern tier." }, { status: 400 });
  }

  const externalOrderId = gumroadSaleExternalId(saleId);
  const currency = (body.currency ?? "usd").toLowerCase();

  try {
    const { patternTitle } = await fulfillPatternPurchase(admin, {
      patternId,
      externalOrderId,
      amountCents: paidCents || expectedCents,
      currency,
    });

    try {
      await sendPatternReadyEmailToAddress({
        to: buyerEmail,
        patternId,
        patternTitle,
      });
    } catch (emailErr) {
      console.error("[webhook/gumroad] Purchase email failed (order still completed)", emailErr);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Fulfillment error";
    await admin.from("patterns").update({ generation_error: message }).eq("id", patternId);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
