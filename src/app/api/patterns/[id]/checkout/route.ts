import { NextResponse } from "next/server";
import { getPublicAppUrl } from "@/lib/app-url";
import { buildGumroadCheckoutUrl, gumroadProductUrl } from "@/config/gumroad-checkout";
import { buildCheckoutLineItem, getPricingTierIdFromPatternRow } from "@/lib/pricing-checkout";
import { resolveStripeProductId } from "@/config/pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    return await postCheckout(ctx);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout failed";
    console.error("[POST /api/patterns/[id]/checkout]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function postCheckout(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: row, error } = await supabase.from("patterns").select("*").eq("id", id).maybeSingle();
  if (error || !row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!row.preview_image_url) {
    return NextResponse.json({ error: "Create a preview before checkout." }, { status: 400 });
  }

  const appUrl = getPublicAppUrl().origin;
  const tierId = getPricingTierIdFromPatternRow(row);

  const gumroadBase = gumroadProductUrl(tierId);
  if (gumroadBase) {
    const url = buildGumroadCheckoutUrl(gumroadBase, {
      patternId: id,
      email: user.email ?? undefined,
    });
    await supabase
      .from("patterns")
      .update({ stripe_session_id: null, payment_status: "pending_payment" })
      .eq("id", id);
    return NextResponse.json({ url, provider: "gumroad" as const });
  }

  const lineItems = [buildCheckoutLineItem(tierId)];
  const stripeProductId = resolveStripeProductId(tierId);

  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/preview/${id}`,
      metadata: {
        patternId: id,
        pricingTier: tierId,
        ...(stripeProductId ? { stripeProductId } : {}),
      },
      client_reference_id: id,
      customer_email: user.email ?? undefined,
    });
  } catch (stripeErr: unknown) {
    const msg =
      stripeErr && typeof stripeErr === "object" && "message" in stripeErr
        ? String((stripeErr as { message?: string }).message)
        : "Stripe could not start checkout.";
    console.error("[Stripe checkout.sessions.create]", stripeErr);
    return NextResponse.json(
      {
        error: `${msg} Check Vercel env: STRIPE_SECRET_KEY, STRIPE_PRICE_ID_BASIC / PLUS / PRO (or legacy STRIPE_PRICE_ID / STRIPE_PRICE_ID_STARTER / PREMIUM), and one-time USD prices.`,
      },
      { status: 502 },
    );
  }

  await supabase
    .from("patterns")
    .update({ stripe_session_id: session.id, payment_status: "pending_payment" })
    .eq("id", id);

  return NextResponse.json({ url: session.url });
}
