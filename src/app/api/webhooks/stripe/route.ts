import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { fulfillPatternPurchase } from "@/lib/fulfill-pattern-purchase";
import { sendPatternReadyEmail } from "@/lib/purchase-email";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

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
  const amount = session.amount_total ?? 0;
  const currency = session.currency ?? "usd";
  const pi =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent && "id" in session.payment_intent
        ? session.payment_intent.id
        : null;

  try {
    const { patternTitle, userId } = await fulfillPatternPurchase(admin, {
      patternId,
      externalOrderId: session.id,
      amountCents: amount,
      currency,
      paymentIntentId: pi,
    });

    let profileEmail: string | null = null;
    const { data: prof } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
    if (prof?.email && typeof prof.email === "string") profileEmail = prof.email;

    try {
      await sendPatternReadyEmail({
        session,
        patternId,
        patternTitle,
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
