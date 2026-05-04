"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Cropper, { type Area, type MediaSize } from "react-easy-crop";
import { CropTextLiveOverlay } from "@/components/create/CropTextLiveOverlay";
import {
  defaultTextTypography,
  FONT_SIZE_SCALE_MAX,
  FONT_SIZE_SCALE_MIN,
  OVERLAY_FONT_OPTIONS,
  type TextTypography,
} from "@/lib/canvas-crop-text";
import { buildOverlayDraftV1 } from "@/lib/overlay-draft";
import type { CropPercent } from "@/lib/pattern-engine";
import { shrinkImageFileIfNeeded } from "@/lib/shrink-image-client";

const ASPECT_PRESETS = [
  { id: "portrait", label: "Portrait", value: 3 / 4 },
  { id: "landscape", label: "Landscape", value: 4 / 3 },
  { id: "square", label: "Square", value: 1 },
] as const;

const CROP_MIN_ZOOM = 0.28;
const CROP_MAX_ZOOM = 3;

function hexForColorInput(c: string) {
  const t = c.trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t;
  if (/^#[0-9a-f]{3}$/i.test(t)) {
    const s = t.slice(1);
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
  }
  return "#ffffff";
}

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

/** Large ZIPs return JSON `{ url, filename }` (Supabase signed URL) to avoid Vercel response size limits. */
async function downloadZipFromAdminResponse(
  res: Response,
  fallbackFilename: string,
): Promise<{ emailStatus: string | null }> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = (await res.json()) as { url?: string; filename?: string; emailStatus?: string };
    if (!j.url) throw new Error("No download URL in response");
    const name = j.filename ?? fallbackFilename;
    let blob: Blob;
    try {
      const r2 = await fetch(j.url, { mode: "cors" });
      if (!r2.ok) throw new Error("bad status");
      blob = await r2.blob();
    } catch {
      window.location.href = j.url;
      return { emailStatus: j.emailStatus ?? null };
    }
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    return { emailStatus: j.emailStatus ?? null };
  }
  const emailStatus = res.headers.get("x-demo-email-status");
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition");
  const name = parseFilenameFromContentDisposition(cd) ?? fallbackFilename;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { emailStatus };
}

/** Centered cover-fit crop, mirrors the create flow's deterministic fallback for users who don't drag. */
function computeDefaultCropPct(imgW: number, imgH: number, aspectRatio: number): CropPercent {
  if (!Number.isFinite(imgW) || !Number.isFinite(imgH) || imgW <= 0 || imgH <= 0) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }
  const imgAspect = imgW / imgH;
  if (imgAspect > aspectRatio) {
    const cropW = imgH * aspectRatio;
    const x = (imgW - cropW) / 2;
    return { x: (x / imgW) * 100, y: 0, width: (cropW / imgW) * 100, height: 100 };
  }
  const cropH = imgW / aspectRatio;
  const y = (imgH - cropH) / 2;
  return { x: 0, y: (y / imgH) * 100, width: 100, height: (cropH / imgH) * 100 };
}

function cropPercentMatchesAspect(pct: CropPercent, naturalW: number, naturalH: number, target: number): boolean {
  if (pct.width <= 0 || pct.height <= 0) return false;
  const cropPxW = (pct.width / 100) * naturalW;
  const cropPxH = (pct.height / 100) * naturalH;
  if (cropPxH <= 0) return false;
  const ratio = cropPxW / cropPxH;
  return Math.abs(ratio - target) / target < 0.05;
}

export function AdminDemoTierSamples() {
  const fileInputId = useId();
  const titleInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [canEmail, setCanEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [alsoEmail, setAlsoEmail] = useState(true);
  const [testEmailMessage, setTestEmailMessage] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const [aspect, setAspect] = useState<(typeof ASPECT_PRESETS)[number]["value"]>(3 / 4);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [croppedAreaPercent, setCroppedAreaPercent] = useState<Area | null>(null);
  const [userTouchedCrop, setUserTouchedCrop] = useState(false);
  const [mediaSize, setMediaSize] = useState<MediaSize | null>(null);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
  /** Bumping this remounts <Cropper> so a new image / aspect starts from a clean state. */
  const [cropperBootId, setCropperBootId] = useState(0);

  const [overlayText, setOverlayText] = useState("");
  const [textAnchorX, setTextAnchorX] = useState(50);
  const [textAnchorY, setTextAnchorY] = useState(82);
  const [textTypography, setTextTypography] = useState<TextTypography>(() => defaultTextTypography());
  const [textColor, setTextColor] = useState("#ffffff");

  const cropWrapRef = useRef<HTMLDivElement>(null);
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const textAnchorRef = useRef({ x: 50, y: 82 });
  const textDragRef = useRef<{ id: number; ox: number; oy: number; sx: number; sy: number } | null>(null);
  const [cropFrameSize, setCropFrameSize] = useState<{ width: number; height: number } | null>(null);

  /** Track the crop-frame element's pixel size so the live overlay can size text proportionally to the server raster. */
  useEffect(() => {
    const el = cropFrameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const rect = entry.contentRect;
      setCropFrameSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) setCropFrameSize({ width: r.width, height: r.height });
    return () => ro.disconnect();
  }, [aspect, imageUrl]);

  useEffect(() => {
    textAnchorRef.current = { x: textAnchorX, y: textAnchorY };
  }, [textAnchorX, textAnchorY]);

  /** Probe natural image size with a vanilla Image() so we always have it for the crop fallback. */
  useEffect(() => {
    if (!imageUrl) {
      setImageNaturalSize(null);
      return;
    }
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      if (!cancelled) setImageNaturalSize(null);
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  /** Free object URLs we created when imageUrl changes (fresh upload) or we unmount. */
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  useEffect(() => {
    void fetch("/api/admin/demo-tier-samples")
      .then((r) => r.json())
      .then((j: { canEmail?: boolean }) => setCanEmail(Boolean(j.canEmail)))
      .catch(() => setCanEmail(false));
  }, []);

  const onTextDragDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const a = textAnchorRef.current;
    textDragRef.current = { id: e.pointerId, ox: a.x, oy: a.y, sx: e.clientX, sy: e.clientY };
  }, []);

  const onTextDragMove = useCallback((e: React.PointerEvent) => {
    const d = textDragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const target = cropFrameRef.current ?? cropWrapRef.current;
    if (!target) return;
    const r = target.getBoundingClientRect();
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

  const onCropComplete = useCallback((area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
    setCroppedAreaPercent(area);
  }, []);

  const onSelectFile = (f: File | null) => {
    setError(null);
    setMessage(null);
    if (!f) return;
    setFile(f);
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCroppedAreaPercent(null);
    setUserTouchedCrop(false);
    setMediaSize(null);
    setCropperBootId((k) => k + 1);
    setOverlayText("");
    setTextAnchorX(50);
    setTextAnchorY(82);
    setTextTypography(defaultTextTypography());
    setTextColor("#ffffff");
  };

  const clearImage = () => {
    setError(null);
    setMessage(null);
    setFile(null);
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCroppedAreaPercent(null);
    setUserTouchedCrop(false);
    setMediaSize(null);
    setImageNaturalSize(null);
    setCropperBootId((k) => k + 1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /** CropPercent for the current frame: trust cropper if user touched it, otherwise centered cover-fit fallback. */
  const percentCrop = useCallback((): CropPercent => {
    const naturalW = mediaSize?.naturalWidth ?? imageNaturalSize?.width ?? 0;
    const naturalH = mediaSize?.naturalHeight ?? imageNaturalSize?.height ?? 0;
    if (userTouchedCrop) {
      if (croppedAreaPercent) {
        const c: CropPercent = {
          x: croppedAreaPercent.x,
          y: croppedAreaPercent.y,
          width: croppedAreaPercent.width,
          height: croppedAreaPercent.height,
        };
        if (naturalW > 0 && naturalH > 0) {
          if (cropPercentMatchesAspect(c, naturalW, naturalH, aspect)) return c;
        } else {
          return c;
        }
      }
      if (mediaSize?.naturalWidth && mediaSize?.naturalHeight && croppedAreaPixels) {
        const nw = mediaSize.naturalWidth;
        const nh = mediaSize.naturalHeight;
        const c: CropPercent = {
          x: (croppedAreaPixels.x / nw) * 100,
          y: (croppedAreaPixels.y / nh) * 100,
          width: (croppedAreaPixels.width / nw) * 100,
          height: (croppedAreaPixels.height / nh) * 100,
        };
        if (cropPercentMatchesAspect(c, nw, nh, aspect)) return c;
      }
    }
    if (naturalW > 0 && naturalH > 0) return computeDefaultCropPct(naturalW, naturalH, aspect);
    return { x: 0, y: 0, width: 100, height: 100 };
  }, [userTouchedCrop, croppedAreaPercent, croppedAreaPixels, mediaSize, imageNaturalSize, aspect]);

  /** Build the FormData payload shared by both submit buttons. Returns null if no image is selected. */
  const buildFormData = useCallback(
    async (extraFields: Record<string, string> = {}): Promise<FormData | null> => {
      if (!file) {
        setError("Choose an image first.");
        return null;
      }
      const shrunk = await shrinkImageFileIfNeeded(file);
      const fd = new FormData();
      fd.append("file", shrunk);
      const trimmedTitle = title.trim();
      if (trimmedTitle) fd.append("title", trimmedTitle);
      fd.append("crop", JSON.stringify(percentCrop()));
      const trimmedOverlayText = overlayText.trim();
      if (trimmedOverlayText.length > 0) {
        const draft = buildOverlayDraftV1({
          text: trimmedOverlayText,
          anchorX: textAnchorX,
          anchorY: textAnchorY,
          typography: textTypography,
          color: textColor,
        });
        fd.append("overlay", JSON.stringify(draft));
      }
      for (const [k, v] of Object.entries(extraFields)) fd.append(k, v);
      return fd;
    },
    [file, title, percentCrop, overlayText, textAnchorX, textAnchorY, textTypography, textColor],
  );

  const submitTierSamples = useCallback(async () => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const fd = await buildFormData(alsoEmail && canEmail ? { alsoEmail: "1" } : {});
      if (!fd) return;
      const res = await fetch("/api/admin/demo-tier-samples", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        const fallback =
          res.status === 413
            ? "Upload too large for the server (common on Vercel). Try a smaller JPEG/PNG."
            : res.status === 503
              ? "Server could not prepare the download (often Supabase Storage or env keys)."
              : `Request failed (${res.status})`;
        throw new Error([j.error ?? fallback, j.detail].filter(Boolean).join(" — "));
      }
      const { emailStatus } = await downloadZipFromAdminResponse(res, "StitchMint-tier-samples.zip");
      let msg = "Your sample pack download has started.";
      if (alsoEmail && canEmail) {
        if (emailStatus === "sent-attached" || emailStatus === "sent")
          msg += " A copy was emailed to you with the ZIP attached.";
        else if (emailStatus === "sent-link-only")
          msg += " A copy was emailed with a download link (ZIP was too large to attach).";
        else if (emailStatus === "missing-resend")
          msg += " Email was not sent (set RESEND_API_KEY on the server).";
        else if (emailStatus?.startsWith("failed:")) msg += ` Email failed: ${emailStatus.slice(7)}`;
      }
      setMessage(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, [alsoEmail, canEmail, buildFormData]);

  const submitWebappShowcase = useCallback(async () => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const fd = await buildFormData();
      if (!fd) return;
      const res = await fetch("/api/admin/webapp-download-showcase", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        const fallback =
          res.status === 413
            ? "Upload too large for the server (common on Vercel). Try a smaller image."
            : res.status === 503
              ? "Server could not prepare the download (often Supabase Storage or env keys)."
              : `Request failed (${res.status})`;
        throw new Error([j.error ?? fallback, j.detail].filter(Boolean).join(" — "));
      }
      await downloadZipFromAdminResponse(res, "StitchMint-webapp-download-showcase.zip");
      setMessage("Web app showcase download started (bundles + unpacked for Basic, Premium, Pro).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, [buildFormData]);

  const sendTestResend = useCallback(async () => {
    setError(null);
    setTestEmailMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/test-resend", { method: "POST" });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        hint?: string;
        from?: string;
        to?: string;
        id?: string | null;
      };
      if (!res.ok) {
        throw new Error([j.error, j.hint].filter(Boolean).join(" — ") || `Request failed (${res.status})`);
      }
      setTestEmailMessage(`Test email sent to ${j.to ?? "you"} from ${j.from ?? "RESEND_FROM"}. Resend id: ${j.id ?? "—"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test send failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const pickTextColorFromScreen = async () => {
    type EyeCtor = new () => { open: () => Promise<{ sRGBHex: string }> };
    const Eye = (typeof window !== "undefined"
      ? (window as unknown as { EyeDropper?: EyeCtor }).EyeDropper
      : undefined) as EyeCtor | undefined;
    if (!Eye) {
      window.alert(
        "Color picking from the screen needs a supported browser (e.g. Chrome or Edge) and a secure (https) page.",
      );
      return;
    }
    try {
      const { sRGBHex } = await new Eye().open();
      setTextColor(sRGBHex);
    } catch {
      /* user cancelled */
    }
  };

  return (
    <section className="mt-10 rounded-3xl border border-line bg-card/90 p-6 shadow-sm">
      <h2 className="font-serif text-2xl text-ink">Sample pattern builder</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Upload an image, frame it, and (optionally) add a title overlay — same controls customers see in the create
        flow. <strong className="text-ink">Tier sample pack</strong> emits one ZIP with three tier bundles inside;{" "}
        <strong className="text-ink">Web app showcase</strong> adds the same three bundles unpacked for inspection.
        Large images are auto-shrunk in the browser to fit Vercel's request limit.
      </p>

      <div className="mt-6">
        <label htmlFor={fileInputId} className="text-xs uppercase tracking-wide text-muted">
          Image file
        </label>
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="mt-2 block w-full max-w-md text-sm text-ink file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-medium file:text-cream"
          disabled={busy}
          onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {imageUrl ? (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
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
                    setCroppedAreaPercent(null);
                    setUserTouchedCrop(false);
                    setCropperBootId((k) => k + 1);
                  }}
                  className={`rounded-full px-4 py-2 text-sm ${
                    aspect === p.value ? "bg-ink text-cream" : "bg-cream-deep/80 text-ink hover:bg-cream-deep"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={clearImage}
              className="rounded-full border border-line bg-card px-3 py-1 text-xs font-medium text-ink hover:bg-cream-deep/80"
              disabled={busy}
            >
              Remove image
            </button>
          </div>

          <div
            ref={cropWrapRef}
            onPointerDown={() => setUserTouchedCrop(true)}
            className="relative h-[320px] w-full overflow-hidden rounded-2xl bg-black/5 sm:h-[420px]"
          >
            <Cropper
              key={`${imageUrl}-${cropperBootId}`}
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              minZoom={CROP_MIN_ZOOM}
              maxZoom={CROP_MAX_ZOOM}
              aspect={aspect}
              restrictPosition={false}
              onCropChange={(c) => {
                setCrop(c);
                setUserTouchedCrop(true);
              }}
              onZoomChange={(z) => {
                setZoom(z);
                setUserTouchedCrop(true);
              }}
              onCropComplete={onCropComplete}
              onMediaLoaded={setMediaSize}
              showGrid={false}
            />
            <div className="pointer-events-none absolute inset-0 z-[24] flex items-center justify-center">
              <div
                ref={cropFrameRef}
                className="pointer-events-none relative"
                style={{
                  height: "100%",
                  aspectRatio: `${aspect}`,
                  maxWidth: "100%",
                }}
              >
                {overlayText.trim().length > 0 ? (
                  <CropTextLiveOverlay
                    text={overlayText}
                    anchorX={textAnchorX}
                    anchorY={textAnchorY}
                    typography={textTypography}
                    color={textColor}
                    dragHandlers={textDragHandlers}
                    frameSize={cropFrameSize}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm text-muted">Zoom in or out</label>
            <input
              type="range"
              min={CROP_MIN_ZOOM}
              max={CROP_MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => {
                setZoom(Number(e.target.value));
                setUserTouchedCrop(true);
              }}
              className="mt-2 w-full accent-ink"
            />
          </div>

          <div>
            <label htmlFor={titleInputId} className="text-xs uppercase tracking-wide text-muted">
              Title (used in PDFs and ZIP filenames)
            </label>
            <input
              id={titleInputId}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Defaults to the image filename"
              className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
          </div>

          <div className="rounded-2xl border border-line bg-cream/50 p-4 sm:p-5">
            <h3 className="text-sm font-medium text-ink">Text on your photo (optional)</h3>
            <p className="mt-1 text-xs text-muted">
              Type below — a live preview appears on the crop. Drag the text block to position it; what you see in the
              frame is what gets baked into every tier's pattern.
            </p>
            <div className="mt-4 grid gap-4 text-left sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-sm text-muted">Text</label>
                <textarea
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
                  {(
                    [
                      ["Top center", 50, 12],
                      ["Center", 50, 50],
                      ["Bottom center", 50, 82],
                    ] as const
                  ).map(([label, x, y]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        setTextAnchorX(x);
                        setTextAnchorY(y);
                      }}
                      className="rounded-full bg-cream-deep/80 px-4 py-2 text-sm text-ink hover:bg-cream-deep"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-muted">Font</label>
                <select
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
                <label className="text-sm text-muted">Weight</label>
                <select
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
                <label className="text-sm text-muted">
                  Font size — {Math.round(textTypography.sizeScale * 100)}% of auto-fit
                </label>
                <input
                  type="range"
                  min={FONT_SIZE_SCALE_MIN}
                  max={FONT_SIZE_SCALE_MAX}
                  step={0.05}
                  value={textTypography.sizeScale}
                  onChange={(e) => setTextTypography((t) => ({ ...t, sizeScale: Number(e.target.value) }))}
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
                  {(
                    [
                      ["italic", "Italic"],
                      ["underline", "Underline"],
                      ["outline", "Outline"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={Boolean(textTypography[key])}
                        onChange={(e) => setTextTypography((t) => ({ ...t, [key]: e.target.checked }))}
                        className="rounded border-line accent-ink"
                      />
                      {label}
                    </label>
                  ))}
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
              </div>
            </div>
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
              type="button"
              disabled={busy}
              onClick={() => void submitTierSamples()}
              className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-cream shadow disabled:opacity-50"
            >
              {busy ? "Generating…" : "Tier sample pack (3 ZIPs)"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submitWebappShowcase()}
              className="rounded-full border border-line bg-card px-6 py-2.5 text-sm font-medium text-ink shadow-sm disabled:opacity-50"
            >
              {busy ? "Generating…" : "Web app showcase (bundles + unpacked)"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Choose an image above to start composing a sample pattern.</p>
      )}

      <div className="mt-8 border-t border-line pt-6">
        <h3 className="text-sm font-medium text-ink">Resend email test</h3>
        <p className="mt-1 max-w-xl text-xs text-muted">
          Sends one plain message to your admin login email using <code className="rounded bg-cream px-1">RESEND_FROM</code>{" "}
          (or Resend onboarding if unset). Use this to confirm Vercel env vars before relying on “Also email me a copy”.
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
