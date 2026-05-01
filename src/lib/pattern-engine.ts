import sharp from "sharp";
import { type RGB } from "@/lib/color";
import { DETAIL_LEVELS, type DetailLevelId } from "@/lib/constants";
import { reduceConfetti, type GridCell } from "@/lib/confetti";
import { assignSymbols, estimateSkeins, findNearestDmc, loadDmcThreads, type DmcThread } from "@/lib/dmc";
import { kMeansPixels } from "@/lib/kmeans";
import { averageBlockSize, computeStitchabilityScore, difficultyLabel } from "@/lib/stitchability";

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
  totalStitches: number;
  colorCount: number;
  stitchabilityScore: number;
  difficultyLabel: string;
  isolatedStitches: number;
  avgBlockSize: number;
};

function clampCrop(c: CropPercent): CropPercent {
  return {
    x: Math.max(0, Math.min(100, c.x)),
    y: Math.max(0, Math.min(100, c.y)),
    width: Math.max(1, Math.min(100, c.width)),
    height: Math.max(1, Math.min(100, c.height)),
  };
}

export async function generatePattern(input: PatternGenerateInput): Promise<PatternResult> {
  const threads = loadDmcThreads();
  const maxColors = DETAIL_LEVELS[input.detailLevel].maxColors;
  const crop = clampCrop(input.crop);

  const meta = await sharp(input.imageBuffer).rotate().metadata();
  const iw = meta.width ?? 1;
  const ih = meta.height ?? 1;

  const left = Math.round((crop.x / 100) * iw);
  const top = Math.round((crop.y / 100) * ih);
  const width = Math.round((crop.width / 100) * iw);
  const height = Math.round((crop.height / 100) * ih);

  let pipeline = sharp(input.imageBuffer)
    .rotate()
    .extract({
      left: Math.min(left, iw - 1),
      top: Math.min(top, ih - 1),
      width: Math.max(1, Math.min(width, iw - left)),
      height: Math.max(1, Math.min(height, ih - top)),
    })
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

  return {
    stitchWidth: w,
    stitchHeight: h,
    fabricCount: input.fabricCount,
    grid: dmcGrid,
    palette,
    previewPng,
    simulatedPng,
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
