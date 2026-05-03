import type { Area } from "react-easy-crop";

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
  /**
   * Start from a band-proportional size so big crops (e.g. 1500×2000 from server-side raster) get a font that is
   * visible after we resize down to the stitch grid. Capping at 64 made titles disappear into a couple of stitches.
   */
  let size = Math.max(16, Math.round(maxBand * 0.22));
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

/** Perceived luminance test so we can pick a black or white outline that contrasts with the user's text color. */
function isLightTextColor(hex: string): boolean {
  const m = hex.replace("#", "").trim();
  let r = 255;
  let g = 255;
  let b = 255;
  if (m.length === 6) {
    r = parseInt(m.slice(0, 2), 16);
    g = parseInt(m.slice(2, 4), 16);
    b = parseInt(m.slice(4, 6), 16);
  } else if (m.length === 3) {
    r = parseInt(m[0]! + m[0]!, 16);
    g = parseInt(m[1]! + m[1]!, 16);
    b = parseInt(m[2]! + m[2]!, 16);
  }
  if (![r, g, b].every((v) => Number.isFinite(v))) return true;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55;
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

  /**
   * After DMC quantization on a 200-stitch grid a flat fill blends into similar fur/background colors and the
   * title can disappear. A thin contrasting outline (chosen automatically from the text color's luminance) keeps
   * the lettering legible without looking like a drop shadow.
   */
  const outlineColor = isLightTextColor(color) ? "#000000" : "#ffffff";
  const outlineWidth = Math.max(1, fontSize * 0.06);

  lines.forEach((line, i) => {
    const y = startY + i * lineH;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = outlineWidth;
    ctx.strokeStyle = outlineColor;
    ctx.strokeText(line, ax, y);
    ctx.restore();
    ctx.fillStyle = color;
    ctx.fillText(line, ax, y);
    if (typography.underline) {
      ctx.save();
      ctx.lineWidth = Math.max(1.5, fontSize * 0.07);
      ctx.fillStyle = color;
      drawUnderline(ctx, ax, y, line, fontSize);
      ctx.restore();
    }
  });
}

/** Same layout as the create-flow canvas; safe to call from Node (`@napi-rs/canvas`) or browser. */
export function drawTextOverlayOnContext(ctx: CanvasRenderingContext2D, cw: number, ch: number, spec: TextOverlaySpec) {
  const rawLines = spec.text.replace(/\r\n/g, "\n").split("\n");
  const lines = rawLines.map((s) => s.trim()).filter((s) => s.length > 0);
  if (lines.length === 0) return;

  const ax = (spec.anchorX / 100) * cw;
  const ay = (spec.anchorY / 100) * ch;
  drawStraightAtAnchor(ctx, lines, cw, ch, ax, ay, spec.typography, spec.color);
}

/** Loads the image and crops to `pixelCrop` without drawing text (used when overlay is stored in `overlay_draft`). */
export async function composeCroppedImageWithoutText(imageUrl: string, pixelCrop: Area): Promise<HTMLCanvasElement> {
  const img = await loadImage(imageUrl);
  const safe = clampCrop(img, pixelCrop);
  return cropImageToCanvas(img, safe);
}

/** Loads the image, crops to `pixelCrop`, then draws text overlay when `spec.text` is non-empty. */
export async function composeCroppedImageWithOverlay(
  imageUrl: string,
  pixelCrop: Area,
  spec: TextOverlaySpec,
): Promise<HTMLCanvasElement> {
  const canvas = await composeCroppedImageWithoutText(imageUrl, pixelCrop);
  if (spec.text.trim().length > 0) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is not available");
    drawTextOverlayOnContext(ctx, canvas.width, canvas.height, spec);
  }
  return canvas;
}
