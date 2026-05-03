import { Resend } from "resend";

/**
 * Resend environment variables — names must match Vercel / Resend docs exactly (case-sensitive).
 * @see https://resend.com/docs/send-with-nextjs
 *
 * Do not use NEXT_PUBLIC_* for the API key (that would expose it in the browser bundle).
 * This module reads only `RESEND_API_KEY` for the SDK — no legacy or alternate env names.
 */
export const RESEND_API_KEY_ENV = "RESEND_API_KEY" as const;
export const RESEND_FROM_ENV = "RESEND_FROM" as const;

/** Raw key from env, or undefined. Uses only `RESEND_API_KEY`. */
export function getResendApiKey(): string | undefined {
  const k = process.env[RESEND_API_KEY_ENV]?.trim();
  return k || undefined;
}

/** Shared Resend client when the key is set; otherwise `null`. Always uses `RESEND_API_KEY` only. */
export function getResendClient(): Resend | null {
  const key = getResendApiKey();
  return key ? new Resend(key) : null;
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
