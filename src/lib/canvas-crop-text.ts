import type { Area } from "react-easy-crop";

export const FONT_SIZE_SCALE_MIN = 0.35;
export const FONT_SIZE_SCALE_MAX = 2.5;

export type TextTypography = {
  fontId: string;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  /** When true, draws a thin contrasting stroke around the text for legibility on busy backgrounds. */
  outline: boolean;
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

/**
 * Each option's stack puts a bundled, server-registered font first (Inter / Lora / Anton /
 * RobotoMono — see src/lib/server-fonts.ts) and then falls back to host-installed equivalents so
 * the editor still picks up nicer system fonts when available. The bundled families guarantee the
 * server canvas always has a registered family to draw with on Vercel serverless, where the host
 * lacks Arial / Helvetica / Palatino / etc. The picker labels stay user-facing and unchanged.
 */
export const OVERLAY_FONT_OPTIONS = [
  { id: "georgia", label: "Georgia", stack: 'Lora, Georgia, "Times New Roman", Times, serif' },
  { id: "times", label: "Times New Roman", stack: 'Lora, "Times New Roman", Times, serif' },
  { id: "system", label: "System UI", stack: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif' },
  { id: "arial", label: "Arial", stack: "Inter, Arial, Helvetica, sans-serif" },
  { id: "verdana", label: "Verdana", stack: "Inter, Verdana, Geneva, sans-serif" },
  { id: "courier", label: "Courier New", stack: 'RobotoMono, "Courier New", Courier, monospace' },
  { id: "impact", label: "Impact", stack: 'Anton, Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
  { id: "palatino", label: "Palatino", stack: 'Lora, Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif' },
  { id: "trebuchet", label: "Trebuchet MS", stack: 'Inter, "Trebuchet MS", "Lucida Grande", Lucida, sans-serif' },
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
  return { fontId: "system", fontWeight: 400, italic: false, underline: false, outline: false, sizeScale: 1 };
}

export function clampTypographySizeScale(scale: number | undefined): number {
  const s = typeof scale === "number" && Number.isFinite(scale) ? scale : 1;
  return Math.min(FONT_SIZE_SCALE_MAX, Math.max(FONT_SIZE_SCALE_MIN, s));
}

function effectiveSizeScale(t: TextTypography): number {
  return clampTypographySizeScale(t.sizeScale);
}

/** Apply user size scale and clamp so text stays drawable. */
export function scaledFontSize(basePx: number, canvasShortEdge: number, typography: TextTypography): number {
  const scaled = Math.round(basePx * effectiveSizeScale(typography));
  const cap = Math.max(48, Math.min(320, Math.round(canvasShortEdge * 0.62)));
  return Math.max(8, Math.min(cap, scaled));
}

/**
 * Compute the same final font size the server's drawStraightAtAnchor would use, given a 2D context
 * (browser or node-canvas) and the same crop-frame geometry. Centralised so the live editor overlay
 * and the server raster agree exactly: same fit-to-width loop + size-scale clamp + cap.
 *
 * `anchorXFraction` is the anchor's x position as 0..1 of the frame width — it determines the
 * "centered text can't run off canvas" max width, the same way drawStraightAtAnchor does.
 */
export function computeOverlayFontSizePx(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  frameWidth: number,
  frameHeight: number,
  anchorXFraction: number,
  typography: TextTypography,
): number {
  const padX = frameWidth * 0.02;
  const ax = anchorXFraction * frameWidth;
  const maxW = Math.min(frameWidth - padX * 2, Math.min(ax, frameWidth - ax) * 2 + padX);
  const maxBand = frameHeight * 0.75;
  const baseFit = fitFontSize(ctx, lines, typography, maxW, maxBand);
  return scaledFontSize(baseFit, Math.min(frameWidth, frameHeight), typography);
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

export function fitFontSize(
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
    /** Allow text to fill ~98% of the available width before we shrink further; 0.92 felt unnecessarily timid. */
    const widest = Math.max(...lines.map((l) => ctx.measureText(l || " ").width));
    if (widest <= maxWidth * 0.98) return size;
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
  /**
   * Resolve the final font size via the shared computeOverlayFontSizePx helper so the live editor
   * overlay (which calls the same helper with an offscreen canvas) and this server raster match
   * to the pixel — including the auto-fit-to-width loop that shrinks the title when it would
   * otherwise overflow the crop frame.
   */
  const fontSize = computeOverlayFontSizePx(ctx, lines, cw, ch, ax / cw, typography);
  ctx.font = buildFontCss(typography, fontSize);
  const lineH = fontSize * 1.28;
  const totalH = lines.length * lineH;
  /**
   * Use textBaseline = "middle" so each call to fillText/strokeText puts the line's vertical CENTER
   * at the supplied y. This matches how the live editor positions its text box (CSS centers the box
   * at anchorY via translate(-50%, -50%)). Previously we used "alphabetic" with a 0.72*fontSize fudge,
   * which placed the visual middle of the glyphs ~0.27*fontSize ABOVE anchorY — so titles drifted up
   * relative to the editor preview by an amount proportional to font size, becoming very visible at
   * server-scale font sizes (e.g. 47px for sizeScale 0.55) while invisible in the tiny editor.
   */
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  /** y-center of the first line: top of the text block is at ay - totalH/2; first line center sits half a line below that. */
  const firstLineCenterY = ay - totalH / 2 + lineH / 2;

  /**
   * Outline is opt-in: clean fill by default; thin contrasting stroke when the user enables it (helps
   * titles stay legible on busy stitched backgrounds without looking like a drop shadow).
   */
  const wantsOutline = typography.outline;
  const outlineColor = isLightTextColor(color) ? "#000000" : "#ffffff";
  const outlineWidth = Math.max(1, fontSize * 0.06);

  lines.forEach((line, i) => {
    const y = firstLineCenterY + i * lineH;
    if (wantsOutline) {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.lineWidth = outlineWidth;
      ctx.strokeStyle = outlineColor;
      ctx.strokeText(line, ax, y);
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.fillText(line, ax, y);
    if (typography.underline) {
      ctx.save();
      /**
       * drawUnderline assumes y is the baseline; with textBaseline="middle" the baseline of this line
       * sits ~0.35*fontSize below y, so shift the underline reference accordingly.
       */
      ctx.lineWidth = Math.max(1.5, fontSize * 0.07);
      ctx.fillStyle = color;
      drawUnderline(ctx, ax, y + fontSize * 0.35, line, fontSize);
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
