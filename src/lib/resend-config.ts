/**
 * Resend environment variables — names must match Vercel / Resend docs exactly (case-sensitive).
 * @see https://resend.com/docs/send-with-nextjs
 *
 * Do not use NEXT_PUBLIC_* for the API key (that would expose it in the browser bundle).
 */
export const RESEND_API_KEY_ENV = "RESEND_API_KEY" as const;
export const RESEND_FROM_ENV = "RESEND_FROM" as const;

export function getResendApiKey(): string | undefined {
  const k = process.env[RESEND_API_KEY_ENV]?.trim();
  return k || undefined;
}

export function getResendFrom(): string {
  return process.env[RESEND_FROM_ENV]?.trim() || "StitchMint <onboarding@resend.dev>";
}

export function resendApiKeyMissingHint(): string {
  return (
    `Add "${RESEND_API_KEY_ENV}" in Vercel → Project → Settings → Environment Variables. ` +
    `The name must be exactly that (same spelling as Resend’s docs). Value is your key starting with re_. ` +
    `Enable it for the environment you’re testing (Production vs Preview vs Development), then redeploy. ` +
    `Do not prefix with NEXT_PUBLIC_.`
  );
}
