import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { createSignedDownloadUrl } from "@/lib/pattern-service";
import { STORAGE_BUCKETS } from "@/lib/buckets";

export const runtime = "nodejs";

/**
 * Used by the success page to confirm payment and surface a short-lived download URL.
 */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const patternId = session.metadata?.patternId ?? session.client_reference_id;
  if (!patternId) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  const { data: row } = await supabase.from("patterns").select("*").eq("id", patternId).maybeSingle();
  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json({ status: session.payment_status, downloadUrl: null });
  }

  if (row.payment_status !== "paid" || !row.zip_file_url) {
    return NextResponse.json({ status: "processing", downloadUrl: null });
  }

  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ status: "expired", downloadUrl: null }, { status: 410 });
  }

  const url = await createSignedDownloadUrl(STORAGE_BUCKETS.packages, row.zip_file_url as string, 60 * 10);
  return NextResponse.json({ status: "ready", downloadUrl: url, patternId });
}
