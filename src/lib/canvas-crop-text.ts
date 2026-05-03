import type { Area } from "react-easy-crop";

export type TextPlacement = "top" | "bottom";
export type TextCurve = "none" | "arcUp" | "arcDown";
export type TextFontStyle = "serifBold" | "sansRegular";

export type TextOverlaySpec = {
  text: string;
  placement: TextPlacement;
  curve: TextCurve;
  fontStyle: TextFontStyle;
  color: string;
};

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

function fontCss(style: TextFontStyle, fontSize: number): string {
  if (style === "serifBold") {
    return `700 ${fontSize}px Georgia, "Times New Roman", Times, serif`;
  }
  return `400 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
}

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  style: TextFontStyle,
  maxWidth: number,
  maxBand: number,
): number {
  let size = Math.min(64, Math.max(16, Math.round(maxBand * 0.22)));
  const min = 14;
  while (size >= min) {
    ctx.font = fontCss(style, size);
    const lineHeight = size * 1.25;
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

function drawStraightBlock(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  cw: number,
  ch: number,
  placement: TextPlacement,
  style: TextFontStyle,
  color: string,
) {
  const padX = cw * 0.06;
  const maxW = cw - padX * 2;
  const maxBand = ch * 0.32;
  const fontSize = fitFontSize(ctx, lines, style, maxW, maxBand);
  ctx.font = fontCss(style, fontSize);
  const lineH = fontSize * 1.25;
  const totalH = lines.length * lineH;
  const margin = ch * 0.05;
  const startY = placement === "top" ? margin + fontSize * 0.55 : ch - margin - totalH + fontSize * 0.55;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.32)";
  ctx.lineWidth = Math.max(2, fontSize * 0.09);
  ctx.lineJoin = "round";
  lines.forEach((line, i) => {
    const y = startY + i * lineH;
    ctx.strokeText(line, cw / 2, y);
    ctx.fillText(line, cw / 2, y);
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
  style: TextFontStyle,
  color: string,
  fontSize: number,
) {
  ctx.font = fontCss(style, fontSize);
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
  ctx.strokeStyle = "rgba(0,0,0,0.32)";
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

function drawOverlay(ctx: CanvasRenderingContext2D, cw: number, ch: number, spec: TextOverlaySpec) {
  const rawLines = spec.text.replace(/\r\n/g, "\n").split("\n");
  const lines = rawLines.map((s) => s.trim()).filter((s) => s.length > 0);
  if (lines.length === 0) return;

  const useCurve = spec.curve !== "none" && lines.length === 1;
  const single = lines[0]!;

  if (useCurve) {
    const padX = cw * 0.1;
    const margin = ch * 0.07;
    const arc = Math.min(cw, ch) * 0.055;
    const baselineY = spec.placement === "top" ? margin + ch * 0.035 : ch - margin - ch * 0.035;
    const p0: Vec = { x: padX, y: baselineY };
    const p2: Vec = { x: cw - padX, y: baselineY };
    const p1: Vec =
      spec.curve === "arcUp"
        ? { x: cw / 2, y: baselineY - arc }
        : { x: cw / 2, y: baselineY + arc };
    const arcLen = approxQuadLength(p0, p1, p2);
    let fs = Math.min(64, Math.max(16, Math.round(ch * 0.065)));
    const min = 14;
    while (fs > min) {
      ctx.font = fontCss(spec.fontStyle, fs);
      const tw = ctx.measureText(single).width;
      if (tw <= arcLen * 0.88) break;
      fs -= 2;
    }
    drawCurvedLine(ctx, single, p0, p1, p2, spec.fontStyle, spec.color, fs);
    return;
  }

  drawStraightBlock(ctx, lines, cw, ch, spec.placement, spec.fontStyle, spec.color);
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
