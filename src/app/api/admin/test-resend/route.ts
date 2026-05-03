import { NextResponse } from "next/server";
import { Resend } from "resend";
import { isAdminEmail } from "@/lib/auth-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getResendApiKey, getResendFrom, resendApiKeyMissingHint } from "@/lib/resend-config";

export const runtime = "nodejs";

/**
 * POST: send a minimal email to the signed-in admin (verifies RESEND_API_KEY + RESEND_FROM).
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const key = getResendApiKey();
  if (!key) {
    return NextResponse.json({ error: "RESEND_API_KEY is not set", hint: resendApiKeyMissingHint() }, { status: 400 });
  }

  const from = getResendFrom();
  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({
    from,
    to: user.email,
    subject: "StitchMint — Resend test",
    html: "<p>If you received this, Resend is configured correctly for StitchMint.</p>",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    id: data?.id ?? null,
    to: user.email,
    from,
  });
}
