import type Stripe from "stripe";
import { getPublicAppUrl } from "@/lib/app-url";
import { getResendClient, getResendFrom } from "@/lib/resend-config";

/**
 * After a successful paid checkout, notify the buyer where to download (same account as purchase).
 * Best-effort: failures are logged; callers should not treat as hard errors.
 */
export async function sendPatternReadyEmail(input: {
  session: Stripe.Checkout.Session;
  patternId: string;
  patternTitle: string;
  /** When Stripe session has no customer email (rare), use profile email from DB. */
  fallbackEmail?: string | null;
}): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;

  const from = getResendFrom();
  const s = input.session;
  const details = s.customer_details;
  const to =
    (typeof details?.email === "string" && details.email.trim()) ||
    (typeof s.customer_email === "string" && s.customer_email.trim()) ||
    (typeof input.fallbackEmail === "string" && input.fallbackEmail.trim()) ||
    null;
  if (!to) {
    console.warn("[purchase-email] No customer email; skipping purchase email", s.id);
    return;
  }

  const origin = getPublicAppUrl().origin.replace(/\/+$/, "");
  const previewUrl = `${origin}/preview/${input.patternId}`;
  const myPatternsUrl = `${origin}/my-patterns`;
  const successUrl = `${origin}/success?session_id=${encodeURIComponent(s.id)}`;

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Your StitchMint pattern is ready — ${input.patternTitle}`,
    html: `
<p>Thanks for your purchase.</p>
<p><strong>${escapeHtml(input.patternTitle)}</strong> is paid and your download is ready. Your ZIP includes <strong>two chart PDFs</strong> (regular print and large print) of the same pattern — one price, pick whichever is easier to read.</p>
<p>Open StitchMint while signed in with the <strong>same account you used to create the pattern</strong>, then:</p>
<ul>
  <li><a href="${previewUrl}">Open your pattern preview</a> and tap <strong>Download ZIP</strong>, or</li>
  <li>Go to <a href="${myPatternsUrl}">My patterns</a>.</li>
</ul>
<p>If the site does not show “paid” yet, wait a few seconds and refresh — or open your <a href="${successUrl}">order confirmation page</a>.</p>
<p>— StitchMint</p>
`.trim(),
  });

  if (error) {
    console.error("[purchase-email] Resend error:", error.message);
    throw new Error(error.message);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
