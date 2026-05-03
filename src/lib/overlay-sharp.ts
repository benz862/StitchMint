import sharp from "sharp";
import type { TextOverlaySpec } from "@/lib/canvas-crop-text";
import { clampTypographySizeScale } from "@/lib/canvas-crop-text";

const FONT_SVG_STACK: Record<string, string> = {
  georgia: "Georgia, 'Times New Roman', Times, serif",
  times: "'Times New Roman', Times, serif",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  arial: "Arial, Helvetica, sans-serif",
  verdana: "Verdana, Geneva, sans-serif",
  courier: "'Courier New', Courier, monospace",
  impact: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
  palatino: "Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif",
  trebuchet: "'Trebuchet MS', 'Lucida Grande', Lucida, sans-serif",
};

function fontStackForSvg(fontId: string): string {
  return FONT_SVG_STACK[fontId] ?? FONT_SVG_STACK.system;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hexFill(color: string): string {
  const t = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t;
  if (/^#[0-9a-f]{3}$/i.test(t)) {
    const s = t.slice(1);
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
  }
  return "#ffffff";
}

/**
 * Draws straight multi-line text (same role as client drawStraightAtAnchor) onto the image.
 * Uses heuristics for font size so wide copy still fits without browser measureText.
 */
export async function applyOverlayDraftToImageBuffer(imageBuffer: Buffer, spec: TextOverlaySpec): Promise<Buffer> {
  const lines = spec.text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (lines.length === 0) return imageBuffer;

  const base = sharp(imageBuffer).rotate();
  const meta = await base.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w < 2 || h < 2) return imageBuffer;

  const ax = (spec.anchorX / 100) * w;
  const ay = (spec.anchorY / 100) * h;
  const padX = w * 0.05;
  const maxW = Math.min(w - padX * 2, Math.min(ax, w - ax) * 2 * 0.95 + padX);
  const maxBand = h * 0.4;
  const sizeScale = clampTypographySizeScale(spec.typography.sizeScale);
  const longest = lines.reduce((a, b) => (a.length >= b.length ? a : b), "");

  let fs = Math.min(64, Math.max(16, Math.round(maxBand * 0.22 * sizeScale)));
  const minFs = 14;
  const estWidth = (text: string, fontSize: number) => Math.max(1, [...text].length) * fontSize * 0.58;
  while (fs >= minFs) {
    const lineH = fs * 1.28;
    const totalH = lines.length * lineH;
    if (totalH <= maxBand && estWidth(longest, fs) <= maxW * 0.92) break;
    fs -= 2;
  }
  fs = Math.max(minFs, fs);

  const lineH = fs * 1.28;
  const totalH = lines.length * lineH;
  const startY = ay - totalH / 2 + fs * 0.72;
  const fontFamily = fontStackForSvg(spec.typography.fontId);
  const fontWeight = Math.min(900, Math.max(100, Math.round(spec.typography.fontWeight)));
  const fontStyle = spec.typography.italic ? "italic" : "normal";
  const fill = escapeXml(hexFill(spec.color));
  const strokeW = Math.max(1, fs * 0.09);

  const tspans = lines
    .map((line, i) => {
      const y = startY + i * lineH;
      return `<tspan x="${ax.toFixed(2)}" y="${y.toFixed(2)}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  const underlineEls = spec.typography.underline
    ? lines
        .map((line, i) => {
          const y = startY + i * lineH;
          const est = estWidth(line, fs);
          const pad = Math.max(2, fs * 0.06);
          const x1 = ax - est / 2;
          const x2 = ax + est / 2;
          return `<line x1="${x1.toFixed(2)}" y1="${(y + pad).toFixed(2)}" x2="${x2.toFixed(2)}" y2="${(y + pad).toFixed(2)}" stroke="${fill}" stroke-width="${Math.max(1.5, fs * 0.07).toFixed(2)}" stroke-linecap="round"/>`;
        })
        .join("")
    : "";

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <text
    text-anchor="middle"
    font-family="${escapeXml(fontFamily)}"
    font-weight="${fontWeight}"
    font-style="${fontStyle}"
    font-size="${fs}px"
    fill="${fill}"
    stroke="rgba(0,0,0,0.35)"
    stroke-width="${strokeW.toFixed(2)}"
    paint-order="stroke fill"
  >${tspans}</text>
  ${underlineEls}
</svg>`;

  const overlayPng = await sharp(Buffer.from(svg)).png().toBuffer();
  return base.composite([{ input: overlayPng, left: 0, top: 0 }]).toBuffer();
}
