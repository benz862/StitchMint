import type { Area } from "react-easy-crop";

export type TextCurve = "none" | "arcUp" | "arcDown";

export const FONT_SIZE_SCALE_MIN = 0.35;
export const FONT_SIZE_SCALE_MAX = 2.5;

export type TextTypography = {
  fontId: string;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  /** Multiplier on the auto-fit size (preview + export). */
  sizeScale: number;
};

export type TextOverlaySpec = {
  text: string;
  /** Anchor in crop space, 0–100 (% of width / height). */
  anchorX: number;
  anchorY: number;
  curve: TextCurve;
  typography: TextTypography;
  color: string;
};

export const OVERLAY_FONT_OPTIONS = [
  { id: "georgia", label: "Georgia", stack: 'Georgia, "Times New Roman", Times, serif' },
  { id: "times", label: "Times New Roman", stack: '"Times New Roman", Times, serif' },
  { id: "system", label: "System UI", stack: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif' },
  { id: "arial", label: "Arial", stack: "Arial, Helvetica, sans-serif" },
  { id: "verdana", label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  { id: "courier", label: "Courier New", stack: '"Courier New", Courier, monospace' },
  { id: "impact", label: "Impact", stack: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
  { id: "palatino", label: "Palatino", stack: 'Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif' },
  { id: "trebuchet", label: "Trebuchet MS", stack: '"Trebuchet MS", "Lucida Grande", Lucida, sans-serif' },
] as const;

export function fontStackFromId(id: string): string {
  const o = OVERLAY_FONT_OPTIONS.find((f) => f.id === id);
  return o?.stack ?? OVERLAY_FONT_OPTIONS[2].stack;
}

export function buildFontCss(typography: TextTypography, fontSize: number): string {
  const stylePart = typography.italic ? "italic " : "normal ";
  const stack = fontStackFromId(typography.fontId);
  const w = Math.min(900, Math.max(100, typography.fontWeight));
  return `${stylePart}${w} ${fontSize}px ${stack}`;
}

export function defaultTextTypography(): TextTypography {
  return { fontId: "system", fontWeight: 400, italic: false, underline: false, sizeScale: 1 };
}

export function clampTypographySizeScale(scale: number | undefined): number {
  const s = typeof scale === "number" && Number.isFinite(scale) ? scale : 1;
  return Math.min(FONT_SIZE_SCALE_MAX, Math.max(FONT_SIZE_SCALE_MIN, s));
}

function effectiveSizeScale(t: TextTypography): number {
  return clampTypographySizeScale(t.sizeScale);
}

/** Apply user size scale and clamp so text stays drawable. */
function scaledFontSize(basePx: number, canvasShortEdge: number, typography: TextTypography): number {
  const scaled = Math.round(basePx * effectiveSizeScale(typography));
  const cap = Math.max(48, Math.min(320, Math.round(canvasShortEdge * 0.62)));
  return Math.max(8, Math.min(cap, scaled));
}

type Vec = { x: number; y: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

function clampCrop(img: HTMLImageElement, crop: Area): Area {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  let x = Math.round(crop.x);
  let y = Math.round(crop.y);
  let w = Math.round(crop.width);
  let h = Math.round(crop.height);
  x = Math.max(0, Math.min(x, Math.max(0, iw - 1)));
  y = Math.max(0, Math.min(y, Math.max(0, ih - 1)));
  w = Math.max(1, Math.min(w, iw - x));
  h = Math.max(1, Math.min(h, ih - y));
  return { x, y, width: w, height: h };
}

export function cropImageToCanvas(img: HTMLImageElement, crop: Area): HTMLCanvasElement {
  const c = clampCrop(img, crop);
  const canvas = document.createElement("canvas");
  canvas.width = c.width;
  canvas.height = c.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  ctx.drawImage(img, c.x, c.y, c.width, c.height, 0, 0, c.width, c.height);
  return canvas;
}

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  typography: TextTypography,
  maxWidth: number,
  maxBand: number,
): number {
  let size = Math.min(64, Math.max(16, Math.round(maxBand * 0.22)));
  const min = 14;
  while (size >= min) {
    ctx.font = buildFontCss(typography, size);
    const lineHeight = size * 1.28;
    const totalH = lines.length * lineHeight;
    if (totalH > maxBand) {
      size -= 2;
      continue;
    }
    const widest = Math.max(...lines.map((l) => ctx.measureText(l || " ").width));
    if (widest <= maxWidth * 0.92) return size;
    size -= 2;
  }
  return min;
}

function drawUnderline(ctx: CanvasRenderingContext2D, cx: number, y: number, text: string, fontSize: number) {
  const w = ctx.measureText(text).width;
  const pad = Math.max(2, fontSize * 0.06);
  ctx.beginPath();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = Math.max(1.5, fontSize * 0.07);
  ctx.lineCap = "round";
  ctx.moveTo(cx - w / 2, y + pad);
  ctx.lineTo(cx + w / 2, y + pad);
  ctx.stroke();
}

function drawStraightAtAnchor(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  cw: number,
  ch: number,
  ax: number,
  ay: number,
  typography: TextTypography,
  color: string,
) {
  const padX = cw * 0.05;
  const maxW = Math.min(cw - padX * 2, Math.min(ax, cw - ax) * 2 * 0.95 + padX);
  const maxBand = ch * 0.4;
  const baseFit = fitFontSize(ctx, lines, typography, maxW, maxBand);
  const fontSize = scaledFontSize(baseFit, Math.min(cw, ch), typography);
  ctx.font = buildFontCss(typography, fontSize);
  const lineH = fontSize * 1.28;
  const totalH = lines.length * lineH;
  const startY = ay - totalH / 2 + fontSize * 0.72;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = Math.max(2, fontSize * 0.09);
  ctx.lineJoin = "round";
  lines.forEach((line, i) => {
    const y = startY + i * lineH;
    ctx.strokeText(line, ax, y);
    ctx.fillText(line, ax, y);
    if (typography.underline) {
      ctx.save();
      ctx.lineWidth = Math.max(1.5, fontSize * 0.07);
      drawUnderline(ctx, ax, y, line, fontSize);
      ctx.restore();
    }
  });
}

function quadPoint(p0: Vec, p1: Vec, p2: Vec, t: number): Vec {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function quadTangent(p0: Vec, p1: Vec, p2: Vec, t: number): Vec {
  return {
    x: 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
    y: 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
  };
}

function approxQuadLength(p0: Vec, p1: Vec, p2: Vec, samples = 40): number {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const pt = quadPoint(p0, p1, p2, t);
    len += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    prev = pt;
  }
  return len;
}

function drawCurvedLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  p0: Vec,
  p1: Vec,
  p2: Vec,
  typography: TextTypography,
  color: string,
  fontSize: number,
) {
  ctx.font = buildFontCss(typography, fontSize);
  const chars = [...text];
  if (chars.length === 0) return;
  let total = 0;
  const widths: number[] = [];
  for (const ch of chars) {
    const w = ctx.measureText(ch).width;
    widths.push(w);
    total += w;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = Math.max(2, fontSize * 0.09);
  ctx.lineJoin = "round";
  let acc = 0;
  for (let i = 0; i < chars.length; i++) {
    const w = widths[i]!;
    const mid = acc + w / 2;
    const t = 0.02 + (mid / Math.max(total, 1)) * 0.96;
    const pt = quadPoint(p0, p1, p2, t);
    const tan = quadTangent(p0, p1, p2, t);
    const angle = Math.atan2(tan.y, tan.x);
    const ch = chars[i]!;
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(angle);
    ctx.strokeText(ch, 0, 0);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    acc += w;
  }
}

/**
 * Full-width chord so the arc never degenerates when the anchor is near a corner.
 * Horizontal “peak” of the bend follows anchorX; vertical position follows anchorY.
 */
function curveControlPoints(
  cw: number,
  ch: number,
  anchorX: number,
  anchorY: number,
  curve: TextCurve,
): { p0: Vec; p1: Vec; p2: Vec } {
  const margin = Math.max(10, Math.min(24, cw * 0.02));
  const ay = (anchorY / 100) * ch;
  const p0: Vec = { x: margin, y: ay };
  const p2: Vec = { x: cw - margin, y: ay };
  const arc = Math.min(cw, ch) * 0.1;
  const p1x = Math.max(margin + 6, Math.min(cw - margin - 6, (anchorX / 100) * cw));
  const p1: Vec =
    curve === "arcUp"
      ? { x: p1x, y: ay - arc }
      : { x: p1x, y: ay + arc };
  return { p0, p1, p2 };
}

function drawOverlay(ctx: CanvasRenderingContext2D, cw: number, ch: number, spec: TextOverlaySpec) {
  const rawLines = spec.text.replace(/\r\n/g, "\n").split("\n");
  const lines = rawLines.map((s) => s.trim()).filter((s) => s.length > 0);
  if (lines.length === 0) return;

  const ax = (spec.anchorX / 100) * cw;
  const ay = (spec.anchorY / 100) * ch;
  const useCurve = spec.curve !== "none" && lines.length === 1;
  const single = lines[0]!;

  if (useCurve) {
    const { p0, p1, p2 } = curveControlPoints(cw, ch, spec.anchorX, spec.anchorY, spec.curve);
    const arcLen = approxQuadLength(p0, p1, p2);
    let fs = Math.min(64, Math.max(16, Math.round(ch * 0.065)));
    const min = 14;
    while (fs > min) {
      ctx.font = buildFontCss(spec.typography, fs);
      const tw = ctx.measureText(single).width;
      if (tw <= arcLen * 0.88) break;
      fs -= 2;
    }
    const fsScaled = scaledFontSize(fs, Math.min(cw, ch), spec.typography);
    drawCurvedLine(ctx, single, p0, p1, p2, spec.typography, spec.color, fsScaled);
    return;
  }

  drawStraightAtAnchor(ctx, lines, cw, ch, ax, ay, spec.typography, spec.color);
}

/** Loads the image, crops to `pixelCrop`, then draws text overlay when `spec.text` is non-empty. */
export async function composeCroppedImageWithOverlay(
  imageUrl: string,
  pixelCrop: Area,
  spec: TextOverlaySpec,
): Promise<HTMLCanvasElement> {
  const img = await loadImage(imageUrl);
  const safe = clampCrop(img, pixelCrop);
  const canvas = cropImageToCanvas(img, safe);
  if (spec.text.trim().length > 0) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is not available");
    drawOverlay(ctx, canvas.width, canvas.height, spec);
  }
  return canvas;
}
