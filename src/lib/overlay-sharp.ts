import { createCanvas, loadImage } from "@napi-rs/canvas";
import sharp from "sharp";
import type { TextOverlaySpec } from "@/lib/canvas-crop-text";
import { drawTextOverlayOnContext } from "@/lib/canvas-crop-text";
import { ensureServerFontsRegistered } from "@/lib/server-fonts";

/**
 * Raster text onto the image using Skia (same 2D APIs as the browser). Sharp SVG text is unreliable
 * on serverless (often no visible glyphs), which produced previews with no title.
 */
export async function applyOverlayDraftToImageBuffer(imageBuffer: Buffer, spec: TextOverlaySpec): Promise<Buffer> {
  /**
   * Register bundled fonts before any text draw — Vercel serverless has no usable system fonts, so
   * Arial/Helvetica/Palatino/etc. would otherwise resolve to nothing and the title would render
   * invisibly in prod (while working fine in local dev with Mac/Linux system fonts).
   */
  ensureServerFontsRegistered();
  const lines = spec.text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (lines.length === 0) return imageBuffer;

  const normalized = await sharp(imageBuffer).rotate().png().toBuffer();
  const img = await loadImage(normalized);
  const w = img.width;
  const h = img.height;
  if (w < 2 || h < 2) return imageBuffer;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  drawTextOverlayOnContext(ctx as unknown as CanvasRenderingContext2D, w, h, spec);
  return canvas.toBuffer("image/png");
}
