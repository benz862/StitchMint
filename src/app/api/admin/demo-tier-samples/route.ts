import { NextResponse } from "next/server";
import { Resend } from "resend";
import { isAdminEmail } from "@/lib/auth-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getResendApiKey, getResendFrom, resendApiKeyMissingHint } from "@/lib/resend-config";
import { buildTierSamplesMegaZip } from "@/lib/tier-sample-pack";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 18 * 1024 * 1024;

function safeBaseTitle(name: string): string {
  const base = name.replace(/\.[^/.]+$/, "");
  const cleaned = base.replace(/[^\w\s-]+/g, "").trim();
  return cleaned.slice(0, 80) || "Sample";
}

export async function GET() {
  const canEmail = Boolean(getResendApiKey());
  return NextResponse.json({ canEmail, keyEnvName: "RESEND_API_KEY" });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Image too large (max ${Math.round(MAX_BYTES / (1024 * 1024))} MB)` }, { status: 413 });
  }

  const alsoEmail = form.get("alsoEmail") === "1" || form.get("alsoEmail") === "true";
  const buf = Buffer.from(await file.arrayBuffer());
  const baseTitle = safeBaseTitle(file.name);

  let mega: Buffer;
  try {
    mega = await buildTierSamplesMegaZip(buf, baseTitle);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let emailStatus = "skipped";
  if (alsoEmail) {
    const key = getResendApiKey();
    const from = getResendFrom();
    if (!key) {
      emailStatus = "missing-resend";
      console.warn("[demo-tier-samples]", resendApiKeyMissingHint());
    } else {
      try {
        const resend = new Resend(key);
        const { error } = await resend.emails.send({
          from,
          to: user.email,
          subject: "StitchMint tier sample pack",
          html: "<p>Attached: <strong>StitchMint-tier-samples.zip</strong> with Basic, Premium, and Pro exports from your image (same PDF bundle as customers).</p>",
          attachments: [{ filename: "StitchMint-tier-samples.zip", content: mega }],
        });
        if (error) {
          emailStatus = `failed:${error.message}`;
        } else {
          emailStatus = "sent";
        }
      } catch (err) {
        emailStatus = `failed:${err instanceof Error ? err.message : "send error"}`;
      }
    }
  }

  const filename = `StitchMint-tier-samples-${baseTitle.replace(/\s+/g, "-")}.zip`.replace(/[^a-zA-Z0-9._-]/g, "");

  return new NextResponse(new Uint8Array(mega), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Demo-Email-Status": emailStatus,
      "Cache-Control": "no-store",
    },
  });
}
