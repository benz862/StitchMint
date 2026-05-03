import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getStripe } from "@/lib/stripe";
import { createSignedDownloadUrl } from "@/lib/pattern-service";
import { STORAGE_BUCKETS } from "@/lib/buckets";

export const runtime = "nodejs";

/** Stripe checkout email must match the pattern owner so we can offer a download without a browser cookie (e.g. after Stripe redirect). */
async function checkoutEmailMatchesPatternOwner(
  session: Stripe.Checkout.Session,
  ownerUserId: string | null,
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<boolean> {
  if (!ownerUserId) return false;
  const stripeEmail = (session.customer_details?.email ?? session.customer_email ?? "").trim().toLowerCase();
  if (!stripeEmail) return false;
  const { data, error } = await admin.auth.admin.getUserById(ownerUserId);
  if (error || !data.user?.email) return false;
  return data.user.email.trim().toLowerCase() === stripeEmail;
}

/**
 * Used by the success page to confirm payment and surface a short-lived download URL.
 * Allows access when either (a) the user is signed in and owns the pattern, or (b) no cookie session
 * but Stripe’s checkout email matches the pattern owner (common right after redirect from Stripe).
 */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  const stripe = getStripe();
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: "Invalid or unknown checkout session" }, { status: 400 });
  }

  const patternIdRaw = session.metadata?.patternId ?? session.client_reference_id;
  const patternId = typeof patternIdRaw === "string" ? patternIdRaw : null;
  if (!patternId) {
    return NextResponse.json({ error: "Invalid session (no pattern id)" }, { status: 400 });
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json({ status: session.payment_status ?? "unpaid", downloadUrl: null });
  }

  const admin = createServiceRoleClient();
  const { data: row, error: rowErr } = await admin.from("patterns").select("*").eq("id", patternId).maybeSingle();
  if (rowErr || !row) {
    return NextResponse.json({ error: "Pattern not found" }, { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ownsBySession = Boolean(user && row.user_id === user.id);
  const ownsByStripeEmail = await checkoutEmailMatchesPatternOwner(session, row.user_id as string | null, admin);

  if (!ownsBySession && !ownsByStripeEmail) {
    return NextResponse.json({
      status: "need_sign_in",
      downloadUrl: null,
      message:
        "Sign in with the same StitchMint account you used to create this pattern. (Your Stripe receipt email must match that account.)",
    });
  }

  if (row.payment_status !== "paid" || !row.zip_file_url) {
    return NextResponse.json({
      status: "processing",
      downloadUrl: null,
      ...(typeof row.generation_error === "string" && row.generation_error.trim()
        ? { fulfillmentError: row.generation_error.trim() }
        : {}),
    });
  }

  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ status: "expired", downloadUrl: null }, { status: 410 });
  }

  const url = await createSignedDownloadUrl(STORAGE_BUCKETS.packages, row.zip_file_url as string, 60 * 10);
  return NextResponse.json({ status: "ready", downloadUrl: url, patternId });
}
