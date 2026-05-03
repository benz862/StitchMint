/**
 * Alias for Stripe dashboards configured with `/api/stripewebhook`.
 * Canonical handler: `POST /api/webhooks/stripe` — prefer that URL for new webhooks.
 */
import { POST as stripeWebhookPost } from "../webhooks/stripe/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  return stripeWebhookPost(request);
}
