import { NextResponse } from "next/server";
import { Resend } from "resend";
import { ADMIN_DEMO_INLINE_ZIP_MAX_BYTES, uploadAdminDemoZipAndSignUrl } from "@/lib/admin-demo-storage";
import { isAdminEmail } from "@/lib/auth-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getResendApiKey, getResendFrom, resendApiKeyMissingHint } from "@/lib/resend-config";
import { buildTierSamplesMegaZip } from "@/lib/tier-sample-pack";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Vercel and many hosts limit request bodies (~4.5MB); stay under with client-side shrink + this cap. */
const MAX_BYTES = 4 * 1024 * 1024;

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
    return NextResponse.json(
      {
        error: `Image too large after upload (max ${Math.round(MAX_BYTES / (1024 * 1024))} MB). Export a smaller JPEG or use a lower-resolution file.`,
      },
      { status: 413 },
    );
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

  const filename = `StitchMint-tier-samples-${baseTitle.replace(/\s+/g, "-")}.zip`.replace(/[^a-zA-Z0-9._-]/g, "");

  let signedUrl: string;
  try {
    const out = await uploadAdminDemoZipAndSignUrl(user.id, mega);
    signedUrl = out.url;
  } catch (storageErr) {
    const detail = storageErr instanceof Error ? storageErr.message : String(storageErr);
    console.error("[demo-tier-samples] Supabase upload failed", detail);
    if (mega.length > ADMIN_DEMO_INLINE_ZIP_MAX_BYTES) {
      return NextResponse.json(
        {
          error: "Could not store the demo ZIP in Supabase (file too large to stream from this host).",
          detail:
            detail +
            " — Check SUPABASE_SERVICE_ROLE_KEY on Vercel and that the `packages` bucket exists. Path must allow service uploads.",
        },
        { status: 503 },
      );
    }
    return new NextResponse(new Uint8Array(mega), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
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
          subject: "StitchMint tier sample pack — download link",
          html: `<p>Your tier sample ZIP is ready (link expires in about 15 minutes).</p><p><a href="${signedUrl}">Download StitchMint tier samples</a></p><p>If the button does not work, copy this URL into your browser:<br/><code style="word-break:break-all">${signedUrl}</code></p>`,
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

  return NextResponse.json(
    { url: signedUrl, filename, emailStatus },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
