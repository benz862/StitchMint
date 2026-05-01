"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function SuccessClient() {
  const search = useSearchParams();
  const sessionId = search.get("session_id");
  const [status, setStatus] = useState<"working" | "ready" | "error">(() => (sessionId ? "working" : "error"));
  const [url, setUrl] = useState<string | null>(null);
  const [patternId, setPatternId] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      attempts += 1;
      const res = await fetch(`/api/stripe/session?session_id=${encodeURIComponent(sessionId)}`);
      const json = await res.json();
      if (json.downloadUrl) {
        setUrl(json.downloadUrl as string);
        setPatternId((json.patternId as string) ?? null);
        setStatus("ready");
        return;
      }
      if (json.status === "expired") {
        setStatus("error");
        return;
      }
      if (attempts < 40) {
        timer = setTimeout(tick, 1500);
      } else {
        setStatus("error");
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
      <p className="mt-4 text-sm text-muted">Your pattern is packaged as a ZIP with PDFs and a preview image.</p>

      {status === "working" && <p className="mt-8 text-sm text-muted">Preparing your download…</p>}

      {status === "ready" && url && (
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

      {status === "error" && (
        <div className="mt-10 space-y-4 text-sm text-muted">
          <p>We could not confirm the download yet. If you were charged, check My patterns in a minute or contact support.</p>
          <Link href="/my-patterns" className="inline-block text-ink underline">
            My patterns
          </Link>
        </div>
      )}
    </div>
  );
}
