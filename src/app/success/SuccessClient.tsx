"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Phase = "working" | "ready" | "error" | "sign_in" | "slow";

export function SuccessClient() {
  const search = useSearchParams();
  const sessionId = search.get("session_id");
  const [phase, setPhase] = useState<Phase>(() => (sessionId ? "working" : "error"));
  const [url, setUrl] = useState<string | null>(null);
  const [patternId, setPatternId] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const loginHref = useMemo(() => {
    if (!sessionId) return "/login";
    const next = `/success?session_id=${encodeURIComponent(sessionId)}`;
    return `/login?next=${encodeURIComponent(next)}`;
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      attempts += 1;
      const res = await fetch(`/api/stripe/session?session_id=${encodeURIComponent(sessionId)}`, {
        credentials: "include",
      });
      let json: Record<string, unknown> = {};
      try {
        json = (await res.json()) as Record<string, unknown>;
      } catch {
        json = {};
      }

      if (json.status === "need_sign_in") {
        setPhase("sign_in");
        setHint(
          typeof json.message === "string"
            ? json.message
            : "Sign in with the StitchMint account that owns this pattern to download your ZIP.",
        );
        return;
      }

      if (json.downloadUrl && typeof json.downloadUrl === "string") {
        setUrl(json.downloadUrl);
        setPatternId(typeof json.patternId === "string" ? json.patternId : null);
        setPhase("ready");
        return;
      }

      if (json.status === "expired") {
        setPhase("error");
        setHint("This download window has expired.");
        return;
      }

      if (res.status === 401 || res.status === 403) {
        setPhase("sign_in");
        setHint(typeof json.error === "string" ? json.error : "Please sign in to continue.");
        return;
      }

      if (json.status === "processing") {
        if (typeof json.fulfillmentError === "string" && json.fulfillmentError.trim()) {
          setPhase("slow");
          setHint(json.fulfillmentError.trim());
          return;
        }
        if (attempts >= 36) {
          setPhase("slow");
          setHint(
            "Payment is confirmed, but your ZIP is still not ready. Most often the Stripe **live** webhook is missing or failing — open Stripe Dashboard → Developers → Webhooks (toggle Live) and ensure `checkout.session.completed` is sent to `https://your-domain/api/webhooks/stripe` with the same `STRIPE_WEBHOOK_SECRET` you set on Vercel. Then check Vercel function logs for errors.",
          );
          return;
        }
        timer = setTimeout(tick, 1500);
        return;
      }

      if (attempts < 40) {
        timer = setTimeout(tick, 1500);
      } else {
        setPhase("error");
        setHint(typeof json.error === "string" ? json.error : "Timed out waiting for your download.");
      }
    };
    void tick();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-muted">Missing checkout session.</p>
        <Link href="/my-patterns" className="mt-6 inline-block text-sm text-ink underline">
          My patterns
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="font-serif text-3xl text-ink">You are all set</h1>
      <p className="mt-4 text-sm text-muted">
        Your pattern is packaged as a ZIP with PDFs and a preview image — including{" "}
        <span className="text-ink">both</span> a regular chart and a large-print chart of the same design, one price.
      </p>

      {phase === "working" && <p className="mt-8 text-sm text-muted">Preparing your download…</p>}

      {phase === "ready" && url && (
        <div className="mt-10 space-y-4">
          <a
            href={url}
            className="inline-flex w-full items-center justify-center rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream shadow"
          >
            Download ZIP
          </a>
          {patternId ? (
            <Link href={`/preview/${patternId}`} className="block text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
              View pattern details
            </Link>
          ) : null}
        </div>
      )}

      {phase === "sign_in" && (
        <div className="mt-10 space-y-4 text-sm">
          <p className="text-ink">{hint}</p>
          <Link
            href={loginHref}
            className="inline-flex w-full items-center justify-center rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream shadow"
          >
            Sign in to download
          </Link>
          <Link href="/my-patterns" className="block text-muted underline-offset-4 hover:text-ink hover:underline">
            My patterns
          </Link>
        </div>
      )}

      {phase === "slow" && (
        <div className="mt-10 space-y-4 text-left text-sm text-muted">
          <p className="whitespace-pre-wrap text-ink/90">{hint}</p>
          <Link href="/my-patterns" className="inline-block text-ink underline">
            My patterns
          </Link>
        </div>
      )}

      {phase === "error" && (
        <div className="mt-10 space-y-4 text-sm text-muted">
          <p>{hint ?? "We could not confirm the download yet. If you were charged, check My patterns in a minute or contact support."}</p>
          <Link href="/my-patterns" className="inline-block text-ink underline">
            My patterns
          </Link>
        </div>
      )}
    </div>
  );
}
