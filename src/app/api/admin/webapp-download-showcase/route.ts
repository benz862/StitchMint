import { NextResponse } from "next/server";
import { uploadAdminDemoZipAndSignUrl } from "@/lib/admin-demo-storage";
import { isAdminEmail } from "@/lib/auth-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildWebappDownloadShowcaseZip } from "@/lib/webapp-download-showcase";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 4 * 1024 * 1024;

function safeBaseTitle(name: string): string {
  const base = name.replace(/\.[^/.]+$/, "");
  const cleaned = base.replace(/[^\w\s-]+/g, "").trim();
  return cleaned.slice(0, 80) || "Sample";
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
        error: `Image too large (max ${Math.round(MAX_BYTES / (1024 * 1024))} MB). Try a smaller file — the admin page auto-shrinks large photos before upload.`,
      },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const baseTitle = safeBaseTitle(file.name);

  let mega: Buffer;
  try {
    mega = await buildWebappDownloadShowcaseZip(buf, baseTitle);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const filename = `StitchMint-webapp-download-showcase-${baseTitle.replace(/\s+/g, "-")}.zip`.replace(/[^a-zA-Z0-9._-]/g, "");

  try {
    const { url } = await uploadAdminDemoZipAndSignUrl(user.id, mega);
    return NextResponse.json({ url, filename }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (storageErr) {
    console.error("[webapp-download-showcase] Supabase upload failed, falling back to inline ZIP", storageErr);
    return new NextResponse(new Uint8Array(mega), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }
}
