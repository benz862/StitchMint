"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeRedirectPath } from "@/lib/safe-redirect-path";

export function LoginInner() {
  const search = useSearchParams();
  const next = useMemo(() => safeRedirectPath(search.get("next")), [search]);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const send = async () => {
    setStatus("sending");
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      // Current origin avoids bad NEXT_PUBLIC_APP_URL values that break URL parsing in some browsers.
      const appUrl = window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
      setStatus("sent");
      setMessage("Check your email for a magic sign-in link.");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Could not send link");
    }
  };

  const urlAuthFailed = search.get("error") === "auth";

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-serif text-3xl text-ink">Sign in</h1>
      <p className="mt-3 text-sm text-muted">We will email you a one-tap link. No passwords to remember.</p>
      <p className="mt-2 text-xs text-muted">
        Links are delivered by <span className="text-ink/80">Supabase Auth</span> (not the Resend order email). If email never arrives, check spam and your Supabase project email / SMTP settings.
      </p>

      {urlAuthFailed ? (
        <p className="mt-4 rounded-2xl border border-line bg-cream/70 px-4 py-3 text-sm text-ink">
          That sign-in link could not be completed (expired link, or redirect not allowed). Request a new link below.
        </p>
      ) : null}

      <div className="mt-8 space-y-4 rounded-3xl border border-line bg-card/90 p-6 shadow-sm">
        <label className="block text-sm text-muted">
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            className="mt-2 w-full rounded-2xl border border-line bg-cream/60 px-3 py-2 text-sm text-ink"
            placeholder="you@example.com"
          />
        </label>
        <button
          type="button"
          disabled={status === "sending" || !email}
          onClick={() => void send()}
          className="w-full rounded-full bg-ink px-4 py-3 text-sm font-medium text-cream disabled:opacity-50"
        >
          {status === "sending" ? "Sending…" : "Email me a link"}
        </button>
        {message && status === "error" ? (
          <div className="space-y-3">
            <p className="text-sm text-red-800">{message}</p>
            <p className="text-xs leading-relaxed text-muted">
              In{" "}
              <a
                href="https://supabase.com/docs/guides/auth/redirect-urls"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink underline underline-offset-2"
              >
                Supabase redirect URL docs
              </a>
              : set <strong className="font-medium text-ink">Site URL</strong> to your live site, and add this exact URL to{" "}
              <strong className="font-medium text-ink">Redirect URLs</strong>:{" "}
              <code className="rounded bg-cream px-1 py-0.5 text-[11px] text-ink">
                {typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : "https://your-domain.com/auth/callback"}
              </code>
              {next !== "/my-patterns" ? (
                <>
                  {" "}
                  (query <code className="text-[11px]">?next=…</code> is fine; the path must still be allowed.)
                </>
              ) : null}
            </p>
          </div>
        ) : message ? (
          <p className="text-sm text-muted">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
