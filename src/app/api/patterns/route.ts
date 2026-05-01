import { NextResponse } from "next/server";
import sharp from "sharp";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { STORAGE_BUCKETS } from "@/lib/buckets";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected server error";
    console.error("[POST /api/patterns]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handlePost(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Please upload a JPG, PNG, or WEBP image." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is too large (max 20 MB)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let webp: Buffer;
  try {
    webp = await sharp(buffer).rotate().webp({ quality: 92 }).toBuffer();
  } catch {
    return NextResponse.json({ error: "Could not read that image." }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const title = String(form.get("title") ?? "My Pattern").slice(0, 120);

  const { data: pattern, error: insertError } = await admin
    .from("patterns")
    .insert({
      user_id: user.id,
      title,
      payment_status: "draft",
    })
    .select("id")
    .single();

  if (insertError || !pattern) {
    return NextResponse.json({ error: insertError?.message ?? "Could not create pattern" }, { status: 500 });
  }

  const path = `${user.id}/${pattern.id}/original.webp`;
  const { error: upErr } = await admin.storage.from(STORAGE_BUCKETS.originals).upload(path, webp, {
    contentType: "image/webp",
    upsert: true,
  });
  if (upErr) {
    await admin.from("patterns").delete().eq("id", pattern.id);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { error: updErr } = await admin.from("patterns").update({ original_image_url: path }).eq("id", pattern.id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: pattern.id });
}
