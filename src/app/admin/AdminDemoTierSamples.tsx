"use client";

import { useCallback, useEffect, useId, useState } from "react";

function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const m = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(header);
  const raw = m?.[1] ?? m?.[2];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function AdminDemoTierSamples() {
  const id = useId();
  const [canEmail, setCanEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [alsoEmail, setAlsoEmail] = useState(true);

  useEffect(() => {
    void fetch("/api/admin/demo-tier-samples")
      .then((r) => r.json())
      .then((j: { canEmail?: boolean }) => setCanEmail(Boolean(j.canEmail)))
      .catch(() => setCanEmail(false));
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setMessage(null);
      const form = e.currentTarget;
      const input = form.elements.namedItem("file") as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) {
        setError("Choose an image first.");
        return;
      }
      setBusy(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        if (alsoEmail && canEmail) fd.append("alsoEmail", "1");
        const res = await fetch("/api/admin/demo-tier-samples", { method: "POST", body: fd });
        const emailStatus = res.headers.get("x-demo-email-status") ?? "";
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `Request failed (${res.status})`);
        }
        const blob = await res.blob();
        const cd = res.headers.get("content-disposition");
        const name = parseFilenameFromContentDisposition(cd) ?? "StitchMint-tier-samples.zip";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        let msg = "Your sample pack download has started.";
        if (alsoEmail && canEmail) {
          if (emailStatus === "sent") msg += " A copy was emailed to you.";
          else if (emailStatus === "missing-resend")
            msg += " Email was not sent (set RESEND_API_KEY on the server).";
          else if (emailStatus.startsWith("failed:")) msg += ` Email failed: ${emailStatus.slice(7)}`;
        }
        setMessage(msg);
        input.value = "";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    [alsoEmail, canEmail],
  );

  return (
    <section className="mt-10 rounded-3xl border border-line bg-card/90 p-6 shadow-sm">
      <h2 className="font-serif text-2xl text-ink">Tier sample pack</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Upload one image to generate <strong className="text-ink">Basic</strong>, <strong className="text-ink">Premium</strong>, and{" "}
        <strong className="text-ink">Pro</strong> customer bundles (each ZIP matches what buyers receive). You get one outer ZIP with three
        inner ZIPs. Large images can take up to a minute. Very large uploads may fail on small serverless limits — use a modest file size or run{" "}
        <code className="rounded bg-cream px-1 text-xs text-ink">npm run sample-zips</code> locally if needed.
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div>
          <label htmlFor={id} className="text-xs uppercase tracking-wide text-muted">
            Image file
          </label>
          <input
            id={id}
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="mt-2 block w-full max-w-md text-sm text-ink file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-medium file:text-cream"
            disabled={busy}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={alsoEmail}
            disabled={!canEmail || busy}
            onChange={(e) => setAlsoEmail(e.target.checked)}
          />
          <span>
            Also email me a copy
            {!canEmail ? (
              <span className="text-muted"> — add RESEND_API_KEY (and optionally RESEND_FROM) in Vercel to enable.</span>
            ) : null}
          </span>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-cream shadow disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate & download"}
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-red-800">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-ink">{message}</p> : null}
    </section>
  );
}
