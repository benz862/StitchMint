import { NextResponse } from "next/server";
import { normalizeEmail, notifySpinWebhook, performSpin, sendSpinWinnerEmail } from "@/lib/spin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/spin — run one wheel spin for an email address.
 *
 * Body: { email, optIn?, website? } — `website` is a hidden honeypot field: real visitors
 * leave it empty; when it arrives filled, the request is silently accepted (200, generic
 * body) without drawing a prize, writing a claim, or sending anything.
 *
 * Responses:
 *   200 { status: "won", prize, downloadUrl, unlockDate }
 *   200 { status: "already_spun", unlockDate }
 *   200 { status: "empty_pool" }          — lead still captured via the webhook, no claim burned
 *   400 { error }                          — malformed body / invalid email
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  const o = (body ?? {}) as Record<string, unknown>;

  if (typeof o.website === "string" && o.website.trim() !== "") {
    return NextResponse.json({ status: "received" }, { headers: { "Cache-Control": "no-store" } });
  }

  const optIn = o.optIn !== false;
  const email = normalizeEmail(o.email);
  if (!email) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }

  try {
    const result = await performSpin({ email });
    const spunAt = new Date().toISOString();

    if (result.status === "won") {
      // Best-effort side channels — neither may fail the spin.
      await sendSpinWinnerEmail({
        email,
        prizeTitle: result.prize.title,
        downloadUrl: result.downloadUrl,
        optIn,
      });
      await notifySpinWebhook({
        event: "spin_win",
        email,
        optIn,
        prizeId: result.prize.id,
        prizeTitle: result.prize.title,
        downloadUrl: result.downloadUrl,
        spunAt,
      });
    } else if (result.status === "empty_pool") {
      // Wheel not stocked yet: still capture the lead so the letter signup works.
      await notifySpinWebhook({ event: "spin_signup", email, optIn, spunAt });
    }

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The wheel jammed — please try again" },
      { status: 500 },
    );
  }
}
