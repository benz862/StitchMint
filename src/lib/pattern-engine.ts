import sharp from "sharp";
import { type RGB } from "@/lib/color";
import { DETAIL_LEVELS, type DetailLevelId } from "@/lib/constants";
import { reduceConfetti, type GridCell } from "@/lib/confetti";
import { assignSymbols, estimateSkeins, findNearestDmc, loadDmcThreads, type DmcThread } from "@/lib/dmc";
import { kMeansPixels } from "@/lib/kmeans";
import { averageBlockSize, computeStitchabilityScore, difficultyLabel } from "@/lib/stitchability";
import type { TextOverlaySpec } from "@/lib/canvas-crop-text";
import { applyOverlayDraftToImageBuffer } from "@/lib/overlay-sharp";

export type CropPercent = {
  /** 0–100 of image width */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PatternGenerateInput = {
  imageBuffer: Buffer;
  /** Crop in percentages relative to natural dimensions */
  crop: CropPercent;
  stitchWidth: number;
  detailLevel: DetailLevelId;
  fabricCount: number;
  /** Extra sharpening for expert/detail */
  enhance?: boolean;
  /** Optional overlay text. Coordinates are % of the cropped raster (post-extract). */
  overlaySpec?: TextOverlaySpec | null;
};

export type PatternColorRow = {
  dmcNumber: string;
  dmcName: string;
  hex: string;
  symbol: string;
  stitchCount: number;
  estimatedSkeins: number;
  rgb: RGB;
};

export type PatternResult = {
  stitchWidth: number;
  stitchHeight: number;
  fabricCount: number;
  /** Row-major indices into `palette` */
  grid: number[][];
  palette: PatternColorRow[];
  previewPng: Buffer;
  simulatedPng: Buffer;
  /** WYSIWYG composition (cropped photo + overlay text), pre-quantization, downscaled for web. */
  compositionPng?: Buffer;
  totalStitches: number;
  colorCount: number;
  stitchabilityScore: number;
  difficultyLabel: string;
  isolatedStitches: number;
  avgBlockSize: number;
};

/**
 * Honors crop regions that extend OUTSIDE the source image (when the user zoomed below 1 in the cropper to add
 * margin). The intersection is extracted from the photo, then padded with white so the result matches what the
 * user framed instead of getting clamped to the photo edges (which previously made the subject "fill the frame").
 */
async function extractRequestedCrop(imageBuffer: Buffer, cropPct: CropPercent): Promise<Buffer> {
  const meta = await sharp(imageBuffer).rotate().metadata();
  const iw = meta.width ?? 1;
  const ih = meta.height ?? 1;

  const wantWidthF = Math.max(1, (cropPct.width / 100) * iw);
  const wantHeightF = Math.max(1, (cropPct.height / 100) * ih);
  const wantLeftF = (cropPct.x / 100) * iw;
  const wantTopF = (cropPct.y / 100) * ih;

  const wantW = Math.max(1, Math.round(wantWidthF));
  const wantH = Math.max(1, Math.round(wantHeightF));
  const wantL = Math.round(wantLeftF);
  const wantT = Math.round(wantTopF);

  const inLeft = Math.max(0, Math.min(iw, wantL));
  const inTop = Math.max(0, Math.min(ih, wantT));
  const inRight = Math.max(0, Math.min(iw, wantL + wantW));
  const inBottom = Math.max(0, Math.min(ih, wantT + wantH));
  const inWidth = Math.max(0, inRight - inLeft);
  const inHeight = Math.max(0, inBottom - inTop);

  if (inWidth < 1 || inHeight < 1) {
    return sharp({
      create: { width: wantW, height: wantH, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
  }

  let pipeline = sharp(imageBuffer).rotate().extract({
    left: inLeft,
    top: inTop,
    width: inWidth,
    height: inHeight,
  });

  const padLeft = Math.max(0, inLeft - wantL);
  const padTop = Math.max(0, inTop - wantT);
  const padRight = Math.max(0, wantW - inWidth - padLeft);
  const padBottom = Math.max(0, wantH - inHeight - padTop);

  if (padLeft || padTop || padRight || padBottom) {
    pipeline = pipeline.extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    });
  }

  return pipeline.png().toBuffer();
}

export async function generatePattern(input: PatternGenerateInput): Promise<PatternResult> {
  const threads = loadDmcThreads();
  const maxColors = DETAIL_LEVELS[input.detailLevel].maxColors;

  /**
   * Crop original at full resolution (with white padding outside the photo), THEN merge text overlay so the
   * saved overlay coordinates (% of crop frame) map 1:1 to the same crop the user saw in the editor. Resize and
   * quantize happen after overlay is baked in.
   */
  let cropBuffer = await extractRequestedCrop(input.imageBuffer, input.crop);

  if (input.overlaySpec && input.overlaySpec.text.trim().length > 0) {
    cropBuffer = await applyOverlayDraftToImageBuffer(cropBuffer, input.overlaySpec);
  }

  let pipeline = sharp(cropBuffer)
    .resize({
      width: input.stitchWidth,
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .removeAlpha();

  pipeline = pipeline.normalize();

  if (input.enhance || input.detailLevel === "expert" || input.detailLevel === "detailed") {
    pipeline = pipeline.sharpen(0.55);
  }

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });

  if (info.channels < 3) {
    throw new Error("Expected RGB image data");
  }

  const w = info.width;
  const h = info.height;
  const pixels: RGB[] = [];
  for (let i = 0; i < w * h; i++) {
    const o = i * info.channels;
    pixels.push({ r: data[o]!, g: data[o + 1]!, b: data[o + 2]! });
  }

  const { centers, labels } = kMeansPixels(pixels, maxColors, { iterations: 14 });

  // Map each k-means center to nearest DMC
  const centerDmcs: DmcThread[] = centers.map((c) => findNearestDmc(c, threads));

  // Unique DMC palette preserving first-seen order
  const paletteMap = new Map<string, number>();
  const palette: PatternColorRow[] = [];
  const ensurePalette = (d: DmcThread) => {
    const key = d.number;
    let idx = paletteMap.get(key);
    if (idx === undefined) {
      idx = palette.length;
      paletteMap.set(key, idx);
      palette.push({
        dmcNumber: d.number,
        dmcName: d.name,
        hex: d.hex,
        symbol: "",
        stitchCount: 0,
        estimatedSkeins: 0,
        rgb: d.rgb,
      });
    }
    return idx!;
  };

  for (const d of centerDmcs) ensurePalette(d);

  const gridIdx: GridCell[][] = [];
  for (let y = 0; y < h; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < w; x++) {
      const lab = labels[y * w + x]!;
      const dmc = centerDmcs[lab]!;
      row.push({ dmcIndex: ensurePalette(dmc) });
    }
    gridIdx.push(row);
  }

  const paletteRgb = palette.map((p) => p.rgb);
  const { grid: smoothed, isolatedBefore } = reduceConfetti(gridIdx, paletteRgb);

  const dmcGrid: number[][] = smoothed.map((row) => row.map((c) => c.dmcIndex));

  // Count stitches
  const counts = new Uint32Array(palette.length);
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = dmcGrid[y]![x]!;
      counts[idx] = (counts[idx] ?? 0) + 1;
      total++;
    }
  }

  const symbols = assignSymbols(palette.length);
  for (let i = 0; i < palette.length; i++) {
    const row = palette[i]!;
    row.symbol = symbols[i] ?? "?";
    row.stitchCount = counts[i] ?? 0;
    row.estimatedSkeins = estimateSkeins(row.stitchCount);
  }

  const avgBlock = averageBlockSize(dmcGrid);
  const stitchabilityScore = computeStitchabilityScore({
    colorCount: palette.length,
    stitchWidth: w,
    stitchHeight: h,
    isolatedStitches: isolatedBefore,
    avgBlockSize: avgBlock,
  });

  const previewPng = await renderPreviewPng(dmcGrid, palette, w, h, 10);
  const simulatedPng = await renderPreviewPng(dmcGrid, palette, w, h, 6);

  /**
   * "Composition" PNG = the user's cropped photo with the title overlay rasterized in (pre-quantization). This
   * is the WYSIWYG source of truth — what the user composed in the editor, downscaled to a reasonable web
   * display size. We show it on the preview page so the title is always readable, separately from the stitched
   * simulation which is necessarily quantized into DMC colors.
   */
  const compositionPng = await sharp(cropBuffer)
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true, kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return {
    stitchWidth: w,
    stitchHeight: h,
    fabricCount: input.fabricCount,
    grid: dmcGrid,
    palette,
    previewPng,
    simulatedPng,
    compositionPng,
    totalStitches: total,
    colorCount: palette.length,
    stitchabilityScore,
    difficultyLabel: difficultyLabel(stitchabilityScore),
    isolatedStitches: isolatedBefore,
    avgBlockSize: avgBlock,
  };
}

async function renderPreviewPng(
  grid: number[][],
  palette: PatternColorRow[],
  w: number,
  h: number,
  scale: number,
): Promise<Buffer> {
  const outW = w * scale;
  const outH = h * scale;
  const buf = Buffer.alloc(outW * outH * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = palette[grid[y]![x]!]!;
      const r = p.rgb.r;
      const g = p.rgb.g;
      const b = p.rgb.b;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const ox = x * scale + dx;
          const oy = y * scale + dy;
          const o = (oy * outW + ox) * 3;
          buf[o] = r;
          buf[o + 1] = g;
          buf[o + 2] = b;
        }
      }
    }
  }
  return sharp(buf, { raw: { width: outW, height: outH, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export { finishedSizeInches, inchesToCm, recommendedFabricCut } from "@/lib/measurements";

/** Optional: full chart blocked until purchase — preview shows downsampled symbol hints */
export async function renderObfuscatedMiniChart(
  grid: number[][],
  palette: PatternColorRow[],
  maxDim = 48,
): Promise<Buffer> {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const step = Math.max(1, Math.ceil(Math.max(w, h) / maxDim));
  const tw = Math.ceil(w / step);
  const th = Math.ceil(h / step);
  const cell = 8;
  const buf = Buffer.alloc(tw * cell * th * cell * 3);
  const fillCell = (tx: number, ty: number, rgb: RGB) => {
    for (let dy = 0; dy < cell; dy++) {
      for (let dx = 0; dx < cell; dx++) {
        const ox = tx * cell + dx;
        const oy = ty * cell + dy;
        const o = (oy * tw * cell + ox) * 3;
        buf[o] = rgb.r;
        buf[o + 1] = rgb.g;
        buf[o + 2] = rgb.b;
      }
    }
  };
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const sx = Math.min(w - 1, tx * step);
      const sy = Math.min(h - 1, ty * step);
      const idx = grid[sy]![sx]!;
      const base = palette[idx]!.rgb;
      // darken slightly to imply "preview only"
      const rgb = {
        r: Math.round(Math.max(0, base.r * 0.92)),
        g: Math.round(Math.max(0, base.g * 0.92)),
        b: Math.round(Math.max(0, base.b * 0.92)),
      };
      fillCell(tx, ty, rgb);
    }
  }
  return sharp(buf, { raw: { width: tw * cell, height: th * cell, channels: 3 } })
    .png()
    .toBuffer();
}
