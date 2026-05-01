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

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-serif text-3xl text-ink">Sign in</h1>
      <p className="mt-3 text-sm text-muted">We will email you a one-tap link. No passwords to remember.</p>

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
        {message ? <p className="text-sm text-muted">{message}</p> : null}
      </div>
    </div>
  );
}
