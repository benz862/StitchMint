"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { shrinkImageFileIfNeeded } from "@/lib/shrink-image-client";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      const raw = input.files?.[0];
      if (!raw) {
        setError("Choose an image first.");
        return;
      }
      setBusy(true);
      try {
        const file = await shrinkImageFileIfNeeded(raw);
        const fd = new FormData();
        fd.append("file", file);
        if (alsoEmail && canEmail) fd.append("alsoEmail", "1");
        const res = await fetch("/api/admin/demo-tier-samples", { method: "POST", body: fd });
        const emailStatus = res.headers.get("x-demo-email-status") ?? "";
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          const fallback =
            res.status === 413
              ? "Upload too large for the server (common on Vercel). Try a smaller JPEG/PNG or run the sample scripts locally."
              : `Request failed (${res.status})`;
          throw new Error(j.error ?? fallback);
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

  const [testEmailMessage, setTestEmailMessage] = useState<string | null>(null);

  const sendTestResend = useCallback(async () => {
    setError(null);
    setTestEmailMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/test-resend", { method: "POST" });
      const j = (await res.json()) as { ok?: boolean; error?: string; hint?: string; from?: string; to?: string; id?: string | null };
      if (!res.ok) {
        const parts = [j.error, j.hint].filter(Boolean);
        throw new Error(parts.join(" — ") || `Request failed (${res.status})`);
      }
      setTestEmailMessage(`Test email sent to ${j.to ?? "you"} from ${j.from ?? "RESEND_FROM"}. Resend id: ${j.id ?? "—"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test send failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const downloadWebappShowcase = useCallback(async () => {
    setError(null);
    setMessage(null);
    const raw = fileInputRef.current?.files?.[0];
    if (!raw) {
      setError("Choose an image first.");
      return;
    }
    setBusy(true);
    try {
      const file = await shrinkImageFileIfNeeded(raw);
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/webapp-download-showcase", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        const fallback =
          res.status === 413
            ? "Upload too large for the server (common on Vercel). Try a smaller image or run npm run sample:webapp-showcase locally."
            : `Request failed (${res.status})`;
        throw new Error(j.error ?? fallback);
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition");
      const name = parseFilenameFromContentDisposition(cd) ?? "StitchMint-webapp-download-showcase.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage("Web app showcase download started (bundles + unpacked for Basic, Premium, Pro).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="mt-10 rounded-3xl border border-line bg-card/90 p-6 shadow-sm">
      <h2 className="font-serif text-2xl text-ink">Tier sample pack</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
        Upload one image. <strong className="text-ink">Tier sample pack</strong> gives one ZIP with three inner ZIPs (Basic / Premium / Pro).
        <strong className="text-ink"> Web app showcase</strong> adds the same three complete customer downloads plus each bundle unpacked
        (<code className="rounded bg-cream px-1 text-xs text-ink">README.txt</code> explains the layout). Large jobs can take a couple of minutes.
        Large images are compressed in the browser before upload (Vercel limits request size). You can still run{" "}
        <code className="rounded bg-cream px-1 text-xs text-ink">npm run sample-zips</code> /{" "}
        <code className="rounded bg-cream px-1 text-xs text-ink">npm run sample:webapp-showcase</code> locally.
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div>
          <label htmlFor={id} className="text-xs uppercase tracking-wide text-muted">
            Image file
          </label>
          <input
            ref={fileInputRef}
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
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-cream shadow disabled:opacity-50"
          >
            {busy ? "Generating…" : "Tier sample pack (3 ZIPs)"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void downloadWebappShowcase()}
            className="rounded-full border border-line bg-card px-6 py-2.5 text-sm font-medium text-ink shadow-sm disabled:opacity-50"
          >
            {busy ? "Generating…" : "Web app showcase (bundles + unpacked)"}
          </button>
        </div>
      </form>

      <div className="mt-8 border-t border-line pt-6">
        <h3 className="text-sm font-medium text-ink">Resend email test</h3>
        <p className="mt-1 max-w-xl text-xs text-muted">
          Sends one plain message to your admin login email using <code className="rounded bg-cream px-1">RESEND_FROM</code> (or Resend
          onboarding if unset). Use this to confirm Vercel env vars before emailing large ZIPs.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void sendTestResend()}
          className="mt-3 rounded-full border border-line bg-card px-5 py-2 text-xs font-medium text-ink disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send test email to me"}
        </button>
        {testEmailMessage ? <p className="mt-2 text-xs text-ink">{testEmailMessage}</p> : null}
      </div>

      {error ? <p className="mt-3 text-sm text-red-800">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-ink">{message}</p> : null}
    </section>
  );
}
