"use client";

import { useCallback, useMemo, useState } from "react";
import Cropper, { Area, type MediaSize } from "react-easy-crop";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PRICING_TIERS, type PricingTierId } from "@/config/pricing";
import { FABRIC_COUNTS } from "@/lib/constants";
import { STORAGE_BUCKETS } from "@/lib/buckets";
import { encodeImageFileToWebpBlob } from "@/lib/encode-original-client";
import { finishedSizeInches, inchesToCm } from "@/lib/measurements";
import type { CropPercent } from "@/lib/pattern-engine";
import { readApiJson } from "@/lib/read-api-json";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const ASPECT_PRESETS = [
  { id: "portrait", label: "Portrait", value: 3 / 4 },
  { id: "landscape", label: "Landscape", value: 4 / 3 },
  { id: "square", label: "Square", value: 1 },
] as const;

/** react-easy-crop: below 1 shows more of the image in the frame; above 1 crops tighter. */
const CROP_MIN_ZOOM = 0.5;
const CROP_MAX_ZOOM = 3;

type Step = 1 | 2 | 3 | 4 | 5;

function clampPercent(n: number) {
  return Math.max(0, Math.min(100, n));
}

export function CreateFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [patternId, setPatternId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [aspect, setAspect] = useState<(typeof ASPECT_PRESETS)[number]["value"]>(3 / 4);
  const [mediaSize, setMediaSize] = useState<MediaSize | null>(null);

  const [pricingTierId, setPricingTierId] = useState<PricingTierId>("plus");
  const [fabric, setFabric] = useState<14 | 16 | 18>(16);

  const stitchWidth = useMemo(() => {
    const tier = PRICING_TIERS.find((t) => t.id === pricingTierId);
    return tier?.engine.stitchWidth ?? 120;
  }, [pricingTierId]);
  const stitchHeightGuess = useMemo(() => {
    const ar = aspect === 1 ? 1 : aspect > 1 ? 3 / 4 : 4 / 3;
    return Math.max(40, Math.round(stitchWidth / ar));
  }, [aspect, stitchWidth]);

  const onSelectFile = (f: File | null) => {
    setError(null);
    if (!f) return;
    setFile(f);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(f));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setStep(2);
  };

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const percentCrop = useCallback((): CropPercent => {
    if (!mediaSize?.naturalWidth || !mediaSize.naturalHeight) {
      return { x: 0, y: 0, width: 100, height: 100 };
    }
    if (!croppedAreaPixels) {
      return { x: 0, y: 0, width: 100, height: 100 };
    }
    const nw = mediaSize.naturalWidth;
    const nh = mediaSize.naturalHeight;
    return {
      x: clampPercent((croppedAreaPixels.x / nw) * 100),
      y: clampPercent((croppedAreaPixels.y / nh) * 100),
      width: clampPercent((croppedAreaPixels.width / nw) * 100),
      height: clampPercent((croppedAreaPixels.height / nh) * 100),
    };
  }, [croppedAreaPixels, mediaSize]);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const draftRes = await fetch("/api/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "My Pattern" }),
      });
      const draft = await readApiJson<{ error?: string; id?: string }>(draftRes);
      if (!draftRes.ok) throw new Error(draft.error ?? "Could not start upload");
      if (!draft.id) throw new Error("Could not start upload");

      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You need to be signed in to upload.");

      const webpBlob = await encodeImageFileToWebpBlob(file);
      const contentType = webpBlob.type === "image/webp" ? "image/webp" : "image/jpeg";
      const ext = contentType === "image/webp" ? "webp" : "jpg";
      const storagePath = `${user.id}/${draft.id}/original.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKETS.originals)
        .upload(storagePath, webpBlob, { contentType, upsert: true });
      if (upErr) throw new Error(upErr.message ?? "Upload to storage failed");

      const { error: updErr } = await supabase
        .from("patterns")
        .update({ original_image_url: storagePath })
        .eq("id", draft.id);
      if (updErr) throw new Error(updErr.message ?? "Could not attach image to pattern");

      setPatternId(draft.id);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const generatePreview = async () => {
    if (!patternId) return;
    const cropPct = percentCrop();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/patterns/${patternId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "My Pattern",
          crop: cropPct,
          pricingTier: pricingTierId,
          fabricCount: fabric,
        }),
      });
      const json = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Could not build preview");
      router.push(`/preview/${patternId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build preview");
    } finally {
      setBusy(false);
    }
  };

  const { widthIn, heightIn } = finishedSizeInches(stitchWidth, stitchHeightGuess, fabric);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Step {step} of 5</p>
          <h1 className="font-serif text-3xl text-ink sm:text-4xl">Create your pattern</h1>
        </div>
        <Link href="/" className="text-sm text-muted hover:text-ink">
          Exit
        </Link>
      </div>

      <div className="rounded-3xl border border-line bg-card/90 p-6 shadow-sm sm:p-8">
        {error ? (
          <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>
        ) : null}

        {step === 1 && (
          <div className="space-y-6">
            <p className="text-muted">
              For best results, use a clear, well-lit photo with the subject close to the camera.
            </p>
            <label className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-accent-soft/70 bg-cream/60 px-6 py-16 text-center transition hover:border-accent hover:bg-cream">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
              />
              <span className="font-medium text-ink">Tap to upload</span>
              <span className="mt-2 text-sm text-muted">JPG, PNG, or WEBP · up to 20 MB</span>
            </label>
          </div>
        )}

        {step === 2 && imageUrl && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {ASPECT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setAspect(p.value);
                    setCrop({ x: 0, y: 0 });
                    setZoom(1);
                    setCroppedAreaPixels(null);
                  }}
                  className={`rounded-full px-4 py-2 text-sm ${
                    aspect === p.value ? "bg-ink text-cream" : "bg-cream-deep/80 text-ink hover:bg-cream-deep"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="relative h-[320px] w-full overflow-hidden rounded-2xl bg-black/5 sm:h-[420px]">
              <Cropper
                image={imageUrl}
                crop={crop}
                zoom={zoom}
                minZoom={CROP_MIN_ZOOM}
                maxZoom={CROP_MAX_ZOOM}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                onMediaLoaded={setMediaSize}
                showGrid={false}
              />
            </div>
            <div>
              <label className="text-sm text-muted">Zoom in or out</label>
              <p className="mt-1 text-xs text-muted">
                Drag left to see more of your photo in the frame, right to zoom in tighter.
              </p>
              <input
                type="range"
                min={CROP_MIN_ZOOM}
                max={CROP_MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="mt-2 w-full accent-ink"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <button type="button" className="rounded-full px-5 py-3 text-sm text-muted hover:bg-cream-deep/80" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={upload}
                className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream shadow disabled:opacity-50"
              >
                {busy ? "Uploading…" : "Continue"}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-muted">Choose your pattern tier. This is what you will pay when you unlock the full chart.</p>
            <div className="grid gap-3 sm:grid-cols-1">
              {PRICING_TIERS.map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setPricingTierId(tier.id)}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    pricingTierId === tier.id
                      ? "border-ink bg-cream shadow-sm ring-1 ring-ink/10"
                      : tier.featured
                        ? "border-accent-soft/80 bg-cream/50 hover:border-accent-soft"
                        : "border-line bg-cream/40 hover:border-accent-soft"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-ink">{tier.name}</p>
                    <p className="font-serif text-lg text-ink">{tier.priceLabel}</p>
                  </div>
                  {tier.featured ? (
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-accent-soft">Most popular</p>
                  ) : null}
                  <p className="mt-2 text-sm text-muted">{tier.description}</p>
                  <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-muted">
                    {tier.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-4">
              <button type="button" className="rounded-full px-5 py-3 text-sm text-muted hover:bg-cream-deep/80" onClick={() => setStep(2)}>
                Back
              </button>
              <button type="button" className="rounded-full bg-ink px-6 py-3 text-sm text-cream" onClick={() => setStep(4)}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <p className="text-muted">Choose your fabric. We will show the finished size.</p>
            <div className="grid gap-3">
              {FABRIC_COUNTS.map((f) => (
                <button
                  key={f.count}
                  type="button"
                  onClick={() => setFabric(f.count)}
                  className={`rounded-2xl border px-4 py-4 text-left ${
                    fabric === f.count ? "border-ink bg-cream shadow-sm" : "border-line bg-cream/40 hover:border-accent-soft"
                  }`}
                >
                  <p className="font-medium text-ink">{f.label}</p>
                  <p className="mt-1 text-sm text-muted">
                    About {widthIn.toFixed(2)} × {heightIn.toFixed(2)} in · {inchesToCm(widthIn).toFixed(1)} ×{" "}
                    {inchesToCm(heightIn).toFixed(1)} cm
                  </p>
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-4">
              <button type="button" className="rounded-full px-5 py-3 text-sm text-muted hover:bg-cream-deep/80" onClick={() => setStep(3)}>
                Back
              </button>
              <button type="button" className="rounded-full bg-ink px-6 py-3 text-sm text-cream" onClick={() => setStep(5)}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <p className="text-muted">We will stitch your preview quietly on our servers. This can take a moment.</p>
            <ul className="space-y-2 rounded-2xl border border-line bg-cream/50 px-4 py-4 text-sm text-muted">
              <li>
                <span className="text-ink">Tier:</span> {PRICING_TIERS.find((t) => t.id === pricingTierId)?.name} (
                {PRICING_TIERS.find((t) => t.id === pricingTierId)?.priceLabel})
              </li>
              <li>
                <span className="text-ink">Chart width:</span> {stitchWidth} stitches
              </li>
              <li>
                <span className="text-ink">Fabric:</span> {fabric}-count Aida
              </li>
            </ul>
            <div className="flex justify-between pt-4">
              <button type="button" className="rounded-full px-5 py-3 text-sm text-muted hover:bg-cream-deep/80" onClick={() => setStep(4)}>
                Back
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={generatePreview}
                className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream shadow disabled:opacity-50"
              >
                {busy ? "Stitching preview…" : "Build preview"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
