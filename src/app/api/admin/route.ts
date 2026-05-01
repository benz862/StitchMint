import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/auth-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createServiceRoleClient();
  const q = new URL(request.url).searchParams.get("q")?.trim();

  let profileIds: string[] | null = null;
  if (q) {
    const { data: profs } = await admin.from("profiles").select("id").ilike("email", `%${q}%`).limit(50);
    profileIds = profs?.map((p) => p.id) ?? [];
  }

  let patternQuery = admin.from("patterns").select("*").order("created_at", { ascending: false }).limit(300);
  if (profileIds && profileIds.length) {
    patternQuery = patternQuery.in("user_id", profileIds);
  } else if (profileIds && profileIds.length === 0 && q) {
    return NextResponse.json({ patterns: [], orders: [], revenueCents: 0 });
  }

  const { data: patterns, error: pErr } = await patternQuery;
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const { data: orders, error: oErr } = await admin.from("orders").select("*").order("created_at", { ascending: false }).limit(400);
  if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });

  const revenueCents =
    orders?.filter((o) => o.status === "completed").reduce((sum, o) => sum + (o.amount ?? 0), 0) ?? 0;

  const failed = (patterns ?? []).filter((p) => p.generation_error && p.payment_status !== "paid");

  return NextResponse.json({
    patterns: patterns ?? [],
    orders: orders ?? [],
    revenueCents,
    failedGenerations: failed,
  });
}
