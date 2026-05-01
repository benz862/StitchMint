import { NextResponse } from "next/server";
import { getPublicAppUrl } from "@/lib/app-url";
import { DEFAULT_PATTERN_PRICE_CENTS } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
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
  const stripePriceId = process.env.STRIPE_PRICE_ID?.trim();
  const priceCents = Number(process.env.PATTERN_PRICE_CENTS ?? DEFAULT_PATTERN_PRICE_CENTS);

  const lineItems = stripePriceId
    ? [{ price: stripePriceId, quantity: 1 as const }]
    : [
        {
          quantity: 1 as const,
          price_data: {
            currency: "usd" as const,
            unit_amount: priceCents,
            product_data: {
              name: "StitchMint pattern download",
              description: "Printable chart, legend, and shopping list (PDF + preview image).",
            },
          },
        },
      ];

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/preview/${id}`,
    metadata: { patternId: id },
    client_reference_id: id,
    customer_email: user.email ?? undefined,
  });

  await supabase
    .from("patterns")
    .update({ stripe_session_id: session.id, payment_status: "pending_payment" })
    .eq("id", id);

  return NextResponse.json({ url: session.url });
}
