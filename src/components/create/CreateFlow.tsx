"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cropper, { Area, type MediaSize } from "react-easy-crop";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PRICING_TIERS, type PricingTierId } from "@/config/pricing";
import { FABRIC_COUNTS } from "@/lib/constants";
import { STORAGE_BUCKETS } from "@/lib/buckets";
import type { TextCurve, TextTypography } from "@/lib/canvas-crop-text";
import {
  composeCroppedImageWithOverlay,
  defaultTextTypography,
  FONT_SIZE_SCALE_MAX,
  FONT_SIZE_SCALE_MIN,
  OVERLAY_FONT_OPTIONS,
} from "@/lib/canvas-crop-text";
import { CropTextLiveOverlay } from "@/components/create/CropTextLiveOverlay";
import { encodeCanvasToWebpBlob, encodeImageFileToWebpBlob, getEncodedOutputSize } from "@/lib/encode-original-client";
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

function hexForColorInput(c: string) {
  const t = c.trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t;
  if (/^#[0-9a-f]{3}$/i.test(t)) {
    const s = t.slice(1);
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
  }
  return "#ffffff";
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

  const [overlayText, setOverlayText] = useState("");
  const [textAnchorX, setTextAnchorX] = useState(50);
  const [textAnchorY, setTextAnchorY] = useState(82);
  const [textCurve, setTextCurve] = useState<TextCurve>("none");
  const [textTypography, setTextTypography] = useState<TextTypography>(() => defaultTextTypography());
  const [textColor, setTextColor] = useState("#ffffff");

  const cropWrapRef = useRef<HTMLDivElement>(null);
  const textAnchorRef = useRef({ x: 50, y: 82 });
  const textDragRef = useRef<{ id: number; ox: number; oy: number; sx: number; sy: number } | null>(null);

  useEffect(() => {
    textAnchorRef.current = { x: textAnchorX, y: textAnchorY };
  }, [textAnchorX, textAnchorY]);

  const onTextDragDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const a = textAnchorRef.current;
    textDragRef.current = { id: e.pointerId, ox: a.x, oy: a.y, sx: e.clientX, sy: e.clientY };
  }, []);

  const onTextDragMove = useCallback((e: React.PointerEvent) => {
    const d = textDragRef.current;
    if (!d || d.id !== e.pointerId || !cropWrapRef.current) return;
    const r = cropWrapRef.current.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const dx = ((e.clientX - d.sx) / r.width) * 100;
    const dy = ((e.clientY - d.sy) / r.height) * 100;
    setTextAnchorX(Math.min(97, Math.max(3, d.ox + dx)));
    setTextAnchorY(Math.min(97, Math.max(3, d.oy + dy)));
  }, []);

  const onTextDragUp = useCallback((e: React.PointerEvent) => {
    if (textDragRef.current?.id === e.pointerId) textDragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
  }, []);

  const textDragHandlers = useMemo(
    () => ({
      onPointerDown: onTextDragDown,
      onPointerMove: onTextDragMove,
      onPointerUp: onTextDragUp,
      onPointerCancel: onTextDragUp,
    }),
    [onTextDragDown, onTextDragMove, onTextDragUp],
  );

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
    setOverlayText("");
    setTextAnchorX(50);
    setTextAnchorY(82);
    setTextCurve("none");
    setTextTypography(defaultTextTypography());
    setTextColor("#ffffff");
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

  const pickTextColorFromScreen = async () => {
    type EyeCtor = new () => { open: () => Promise<{ sRGBHex: string }> };
    const Eye = (typeof window !== "undefined" ? (window as unknown as { EyeDropper?: EyeCtor }).EyeDropper : undefined) as
      | EyeCtor
      | undefined;
    if (!Eye) {
      window.alert("Color picking from the screen needs a supported browser (e.g. Chrome or Edge) and a secure (https) page.");
      return;
    }
    try {
      const { sRGBHex } = await new Eye().open();
      setTextColor(sRGBHex);
    } catch {
      /* user cancelled */
    }
  };

  const upload = async () => {
    if (!file) return;
    const trimmedOverlay = overlayText.trim();
    const useTextOverlay = trimmedOverlay.length > 0;
    if (useTextOverlay && (!imageUrl || !croppedAreaPixels)) {
      setError("Adjust the crop frame slightly so the preview can lock in, then try again.");
      return;
    }

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

      let webpBlob: Blob;
      let afterTextUpload: (() => void) | null = null;

      if (useTextOverlay && imageUrl && croppedAreaPixels) {
        const canvas = await composeCroppedImageWithOverlay(imageUrl, croppedAreaPixels, {
          text: trimmedOverlay,
          anchorX: textAnchorX,
          anchorY: textAnchorY,
          curve: textCurve,
          typography: textTypography,
          color: textColor,
        });
        webpBlob = await encodeCanvasToWebpBlob(canvas);
        const { width: ow, height: oh } = getEncodedOutputSize(canvas.width, canvas.height);
        const prevUrl = imageUrl;
        const baseName = file.name.replace(/\.[^.]+$/i, "") || "photo";
        afterTextUpload = () => {
          const nextUrl = URL.createObjectURL(webpBlob);
          if (prevUrl) URL.revokeObjectURL(prevUrl);
          setImageUrl(nextUrl);
          setMediaSize({
            width: ow,
            height: oh,
            naturalWidth: ow,
            naturalHeight: oh,
          });
          setCroppedAreaPixels({ x: 0, y: 0, width: ow, height: oh });
          setCrop({ x: 0, y: 0 });
          setZoom(1);
          const ct = webpBlob.type === "image/webp" ? "image/webp" : "image/jpeg";
          const ext = ct === "image/webp" ? "webp" : "jpg";
          setFile(new File([webpBlob], `${baseName}.${ext}`, { type: ct }));
        };
      } else {
        webpBlob = await encodeImageFileToWebpBlob(file);
      }

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

      afterTextUpload?.();

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
            <div
              ref={cropWrapRef}
              className="relative h-[320px] w-full overflow-hidden rounded-2xl bg-black/5 sm:h-[420px]"
            >
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
              {overlayText.trim().length > 0 ? (
                <CropTextLiveOverlay
                  text={overlayText}
                  anchorX={textAnchorX}
                  anchorY={textAnchorY}
                  curve={textCurve}
                  typography={textTypography}
                  color={textColor}
                  dragHandlers={textDragHandlers}
                />
              ) : null}
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

            <div className="rounded-2xl border border-line bg-cream/50 p-4 sm:p-5">
              <h2 className="text-sm font-medium text-ink">Text on your photo (optional)</h2>
              <p className="mt-1 text-xs text-muted">
                Type below — a live preview appears on the crop. Drag the text (or the round handle on curved text) to
                position it. Curved styles use one line only; use Enter for multiple straight lines.
              </p>
              <div className="mt-4 grid gap-4 text-left sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="stitchmint-overlay-text" className="text-sm text-muted">
                    Text
                  </label>
                  <textarea
                    id="stitchmint-overlay-text"
                    value={overlayText}
                    onChange={(e) => setOverlayText(e.target.value)}
                    maxLength={200}
                    rows={3}
                    placeholder="e.g. Happy Birthday, a name, or a date"
                    className="mt-2 w-full resize-y rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-muted"
                  />
                </div>
                <div>
                  <p className="text-sm text-muted">Quick position</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTextAnchorX(50);
                        setTextAnchorY(12);
                      }}
                      className="rounded-full bg-cream-deep/80 px-4 py-2 text-sm text-ink hover:bg-cream-deep"
                    >
                      Top center
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTextAnchorX(50);
                        setTextAnchorY(50);
                      }}
                      className="rounded-full bg-cream-deep/80 px-4 py-2 text-sm text-ink hover:bg-cream-deep"
                    >
                      Center
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTextAnchorX(50);
                        setTextAnchorY(82);
                      }}
                      className="rounded-full bg-cream-deep/80 px-4 py-2 text-sm text-ink hover:bg-cream-deep"
                    >
                      Bottom center
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted">Curve (single line)</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(
                      [
                        { id: "none" as const, label: "Straight" },
                        { id: "arcUp" as const, label: "Curve up" },
                        { id: "arcDown" as const, label: "Curve down" },
                      ] satisfies { id: TextCurve; label: string }[]
                    ).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setTextCurve(c.id)}
                        className={`rounded-full px-4 py-2 text-sm ${
                          textCurve === c.id ? "bg-ink text-cream" : "bg-cream-deep/80 text-ink hover:bg-cream-deep"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="stitchmint-font-family" className="text-sm text-muted">
                    Font
                  </label>
                  <select
                    id="stitchmint-font-family"
                    value={textTypography.fontId}
                    onChange={(e) => setTextTypography((t) => ({ ...t, fontId: e.target.value }))}
                    className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink"
                  >
                    {OVERLAY_FONT_OPTIONS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="stitchmint-font-weight" className="text-sm text-muted">
                    Weight
                  </label>
                  <select
                    id="stitchmint-font-weight"
                    value={textTypography.fontWeight}
                    onChange={(e) => setTextTypography((t) => ({ ...t, fontWeight: Number(e.target.value) }))}
                    className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink"
                  >
                    {(
                      [
                        [300, "Light"],
                        [400, "Regular"],
                        [500, "Medium"],
                        [600, "Semibold"],
                        [700, "Bold"],
                        [800, "Extra bold"],
                      ] as const
                    ).map(([w, label]) => (
                      <option key={w} value={w}>
                        {label} ({w})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="stitchmint-font-size-scale" className="text-sm text-muted">
                    Font size — {Math.round(textTypography.sizeScale * 100)}% of auto-fit
                  </label>
                  <input
                    id="stitchmint-font-size-scale"
                    type="range"
                    min={FONT_SIZE_SCALE_MIN}
                    max={FONT_SIZE_SCALE_MAX}
                    step={0.05}
                    value={textTypography.sizeScale}
                    onChange={(e) =>
                      setTextTypography((t) => ({ ...t, sizeScale: Number(e.target.value) }))
                    }
                    className="mt-2 w-full accent-ink"
                  />
                  <p className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-muted">
                    <span>35% (tiny)</span>
                    <button
                      type="button"
                      className="rounded-full border border-line bg-card px-2 py-0.5 text-ink hover:bg-cream-deep/80"
                      onClick={() => setTextTypography((t) => ({ ...t, sizeScale: 1 }))}
                    >
                      Reset to 100%
                    </button>
                    <span>250% (huge)</span>
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-sm text-muted">Style</p>
                  <div className="mt-2 flex flex-wrap gap-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={textTypography.italic}
                        onChange={(e) => setTextTypography((t) => ({ ...t, italic: e.target.checked }))}
                        className="rounded border-line accent-ink"
                      />
                      Italic
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={textTypography.underline}
                        onChange={(e) => setTextTypography((t) => ({ ...t, underline: e.target.checked }))}
                        className="rounded border-line accent-ink"
                      />
                      Underline
                    </label>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-sm text-muted">Color</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <input
                      type="color"
                      value={hexForColorInput(textColor)}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-card p-1"
                      aria-label="Text color"
                    />
                    <button
                      type="button"
                      onClick={() => void pickTextColorFromScreen()}
                      className="rounded-full border border-line bg-card px-4 py-2 text-xs font-medium text-ink hover:bg-cream-deep/80"
                    >
                      Eyedropper (screen)
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Eyedropper: supported in Chrome and Edge on https — samples any pixel on screen after you click.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <button type="button" className="rounded-full px-5 py-3 text-sm text-muted hover:bg-cream-deep/80" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                type="button"
                disabled={busy || (overlayText.trim().length > 0 && !croppedAreaPixels)}
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
