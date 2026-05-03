"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { demoPaymentLinkUrl } from "@/config/demo-checkout";
import { finishedSizeInches, inchesToCm } from "@/lib/measurements";
import { readApiJson } from "@/lib/read-api-json";

type CheckoutSummary = {
  tier: string;
  productName: string;
  amountCents: number;
  priceLabel: string;
};

type PatternRow = {
  id: string;
  title: string | null;
  stitch_width: number | null;
  stitch_height: number | null;
  fabric_count: number | null;
  color_count: number | null;
  total_stitches: number | null;
  stitchability_score: number | null;
  payment_status: string | null;
};

export function PreviewClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [pattern, setPattern] = useState<PatternRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [palettePreview, setPalettePreview] = useState<
    { dmcNumber: string; dmcName: string; hex: string; stitchCount: number }[]
  >([]);
  const [difficultyLabel, setDifficultyLabel] = useState<string>("");
  const [checkoutSummary, setCheckoutSummary] = useState<CheckoutSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/patterns/${id}`);
      const json = await readApiJson<{
        error?: string;
        pattern?: PatternRow;
        previewUrl?: string | null;
        palettePreview?: { dmcNumber: string; dmcName: string; hex: string; stitchCount: number }[];
        stats?: { difficultyLabel?: string };
        checkout?: CheckoutSummary;
      }>(res);
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error ?? "Could not load preview");
        return;
      }
      if (!json.pattern) {
        setError("Could not load preview");
        return;
      }
      setPattern(json.pattern);
      setPreviewUrl(json.previewUrl ?? null);
      setPalettePreview(json.palettePreview ?? []);
      setDifficultyLabel(json.stats?.difficultyLabel ?? "");
      setCheckoutSummary(json.checkout ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const sizes = useMemo(() => {
    const w = pattern?.stitch_width ?? 0;
    const h = pattern?.stitch_height ?? 0;
    const f = pattern?.fabric_count ?? 14;
    if (!w || !h || !f) return null;
    const { widthIn, heightIn } = finishedSizeInches(w, h, f);
    return { widthIn, heightIn, cmW: inchesToCm(widthIn), cmH: inchesToCm(heightIn) };
  }, [pattern]);

  const checkout = async () => {
    setBusy(true);
    setError(null);
    try {
      const demoLink = demoPaymentLinkUrl();
      if (demoLink) {
        window.location.href = demoLink;
        return;
      }
      const res = await fetch(`/api/patterns/${id}/checkout`, { method: "POST" });
      const json = await readApiJson<{ error?: string; url?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Checkout could not start");
      if (json.url) window.location.href = json.url as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-red-800">{error}</p>
        <Link href="/create" className="mt-6 inline-block text-sm text-muted underline">
          Start over
        </Link>
      </div>
    );
  }

  if (!pattern) {
    return <div className="mx-auto max-w-xl px-4 py-20 text-center text-muted">Opening your preview…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Preview</p>
          <h1 className="font-serif text-3xl text-ink sm:text-4xl">{pattern.title ?? "Your pattern"}</h1>
        </div>
        <button type="button" onClick={() => router.push("/create")} className="text-sm text-muted hover:text-ink">
          New pattern
        </button>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="overflow-hidden rounded-3xl border border-line bg-card shadow-sm">
          {previewUrl ? (
            <Image src={previewUrl} alt="Stitch preview" width={900} height={900} className="h-auto w-full object-contain" unoptimized />
          ) : (
            <div className="flex h-80 items-center justify-center text-sm text-muted">Preview not ready yet.</div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-line bg-card/90 p-6 shadow-sm">
            <p className="text-sm text-muted">This is a stitched simulation — not the printable chart.</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Stitch count</dt>
                <dd className="font-medium text-ink">
                  {pattern.stitch_width} × {pattern.stitch_height}
                </dd>
              </div>
              {sizes && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Finished size</dt>
                  <dd className="text-right font-medium text-ink">
                    {sizes.widthIn.toFixed(2)} × {sizes.heightIn.toFixed(2)} in
                    <br />
                    <span className="text-xs text-muted">
                      {sizes.cmW.toFixed(1)} × {sizes.cmH.toFixed(1)} cm
                    </span>
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Colors</dt>
                <dd className="font-medium text-ink">{pattern.color_count}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Total stitches</dt>
                <dd className="font-medium text-ink">{pattern.total_stitches?.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Stitchability</dt>
                <dd className="font-medium text-ink">
                  {pattern.stitchability_score}/100 {difficultyLabel ? `· ${difficultyLabel}` : ""}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-3xl border border-line bg-cream/70 p-6">
            <p className="text-sm font-medium text-ink">Thread preview</p>
            <p className="mt-1 text-xs text-muted">Full legend unlocks after purchase.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {palettePreview.map((c) => (
                <div key={c.dmcNumber} className="flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs">
                  <span className="h-4 w-4 rounded-full border border-line" style={{ backgroundColor: `#${c.hex}` }} />
                  <span className="text-ink">{c.dmcNumber}</span>
                  <span className="text-muted">{c.stitchCount}</span>
                </div>
              ))}
            </div>
          </div>

          {pattern.payment_status === "paid" ? (
            <button
              type="button"
              className="inline-flex w-full items-center justify-center rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream"
              onClick={async () => {
                const res = await fetch(`/api/patterns/${id}/download`);
                const json = await readApiJson<{ error?: string; url?: string }>(res);
                if (!res.ok) {
                  setError(json.error ?? "Download failed");
                  return;
                }
                if (json.url) window.location.href = json.url as string;
              }}
            >
              Download ZIP
            </button>
          ) : (
            <>
            <p className="rounded-2xl border border-line bg-cream/50 px-4 py-3 text-xs leading-relaxed text-muted">
              Unlock includes <span className="font-medium text-ink">two chart PDFs</span> (regular + large print) for the same pattern — no
              extra fee. Pick the version that is easiest for you to read and print.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={checkout}
              className="inline-flex w-full items-center justify-center rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream shadow disabled:opacity-50"
            >
              {busy
                ? "Opening secure checkout…"
                : checkoutSummary
                  ? `Unlock ${checkoutSummary.productName} — $${checkoutSummary.priceLabel}`
                  : "Unlock full pattern"}
            </button>
            </>
          )}

          {error ? <p className="text-sm text-red-800">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
