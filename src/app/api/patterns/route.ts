import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Create an empty pattern draft. The browser uploads the original image directly to Supabase Storage
 * (see CreateFlow) so large photos never pass through this route — avoids Vercel FUNCTION_PAYLOAD_TOO_LARGE.
 */
export async function POST(request: Request) {
  try {
    return await handlePostCreateDraft(request);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected server error";
    console.error("[POST /api/patterns]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handlePostCreateDraft(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json(
      {
        error:
          "Use Content-Type: application/json with { \"title\": \"...\" }. Upload the image from the browser to Supabase Storage.",
      },
      { status: 415 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: string } = {};
  try {
    body = (await request.json()) as { title?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = String(body.title ?? "My Pattern").slice(0, 120);
  const admin = createServiceRoleClient();

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

  return NextResponse.json({ id: pattern.id });
}
