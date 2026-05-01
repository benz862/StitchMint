"use client";

import { useCallback, useMemo, useState } from "react";
import Cropper, { Area, type MediaSize } from "react-easy-crop";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DETAIL_LEVELS,
  FABRIC_COUNTS,
  STITCH_WIDTHS,
  type DetailLevelId,
  type StitchWidthId,
} from "@/lib/constants";
import { finishedSizeInches, inchesToCm } from "@/lib/measurements";
import type { CropPercent } from "@/lib/pattern-engine";
import { readApiJson } from "@/lib/read-api-json";

const ASPECT_PRESETS = [
  { id: "portrait", label: "Portrait", value: 3 / 4 },
  { id: "landscape", label: "Landscape", value: 4 / 3 },
  { id: "square", label: "Square", value: 1 },
] as const;

type Step = 1 | 2 | 3 | 4 | 5 | 6;

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

  const [detail, setDetail] = useState<DetailLevelId>("balanced");
  const [widthId, setWidthId] = useState<StitchWidthId>("medium");
  const [fabric, setFabric] = useState<14 | 16 | 18>(16);

  const stitchWidth = useMemo(() => STITCH_WIDTHS.find((w) => w.id === widthId)?.stitches ?? 120, [widthId]);
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
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", "My Pattern");
      const res = await fetch("/api/patterns", { method: "POST", body: fd });
      const json = await readApiJson<{ error?: string; id?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      if (!json.id) throw new Error("Upload succeeded but no pattern id was returned.");
      setPatternId(json.id);
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
          stitchWidth,
          detailLevel: detail,
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
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Step {step} of 6</p>
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
                  onClick={() => setAspect(p.value)}
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
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                onMediaLoaded={setMediaSize}
                showGrid={false}
              />
            </div>
            <div>
              <label className="text-sm text-muted">Zoom</label>
              <input
                type="range"
                min={1}
                max={3}
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
            <p className="text-muted">How much detail should we keep?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(DETAIL_LEVELS) as DetailLevelId[]).map((id) => {
                const d = DETAIL_LEVELS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setDetail(id);
                      const def = STITCH_WIDTHS.find((w) => w.stitches === d.defaultStitchWidth);
                      if (def) setWidthId(def.id);
                    }}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${
                      detail === id ? "border-ink bg-cream shadow-sm" : "border-line bg-cream/40 hover:border-accent-soft"
                    }`}
                  >
                    <p className="font-medium text-ink">{d.label}</p>
                    <p className="mt-1 text-sm text-muted">{d.description}</p>
                    <p className="mt-2 text-xs text-muted">{d.colorHint}</p>
                  </button>
                );
              })}
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
            <p className="text-muted">How wide should the chart be?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {STITCH_WIDTHS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWidthId(w.id)}
                  className={`rounded-2xl border px-4 py-4 text-left ${
                    widthId === w.id ? "border-ink bg-cream shadow-sm" : "border-line bg-cream/40 hover:border-accent-soft"
                  }`}
                >
                  <p className="font-medium text-ink">
                    {w.label} · {w.stitches} stitches wide
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
              <button type="button" className="rounded-full px-5 py-3 text-sm text-muted hover:bg-cream-deep/80" onClick={() => setStep(4)}>
                Back
              </button>
              <button type="button" className="rounded-full bg-ink px-6 py-3 text-sm text-cream" onClick={() => setStep(6)}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <p className="text-muted">We will stitch your preview quietly on our servers. This can take a moment.</p>
            <ul className="space-y-2 rounded-2xl border border-line bg-cream/50 px-4 py-4 text-sm text-muted">
              <li>
                <span className="text-ink">Detail:</span> {DETAIL_LEVELS[detail].label}
              </li>
              <li>
                <span className="text-ink">Width:</span> {stitchWidth} stitches
              </li>
              <li>
                <span className="text-ink">Fabric:</span> {fabric}-count Aida
              </li>
            </ul>
            <div className="flex justify-between pt-4">
              <button type="button" className="rounded-full px-5 py-3 text-sm text-muted hover:bg-cream-deep/80" onClick={() => setStep(5)}>
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
