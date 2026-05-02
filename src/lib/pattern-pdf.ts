import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import type { PatternColorRow } from "@/lib/pattern-engine";
import { CHART_PAGE_LARGE, CHART_PAGE_REGULAR } from "@/lib/constants";
import { finishedSizeInches, inchesToCm, recommendedFabricCut } from "@/lib/measurements";

type ChartVariant = "regular" | "large";
type PdfDoc = InstanceType<typeof PDFDocument>;

export type PatternPdfMeta = {
  title: string;
  fabricCount: number;
  stitchWidth: number;
  stitchHeight: number;
  totalStitches: number;
  colorCount: number;
  stitchabilityScore: number;
  difficultyLabel: string;
};

function collectPdfBuffer(doc: PdfDoc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export type CoverBackgroundImage = { buffer: Buffer; width: number; height: number };

/**
 * Raster cover for Pattern-*.pdf page 1 (Letter, “cover” scaling).
 * Priority: STITCHMINT_COVER_BG_PATH → public/StitchMint_Pattern_Template.jpg → pattern-cover-bg.*.
 */
export async function loadPatternCoverBackground(): Promise<CoverBackgroundImage | null> {
  const custom = process.env.STITCHMINT_COVER_BG_PATH?.trim();
  const candidates = [
    ...(custom ? [custom] : []),
    path.join(process.cwd(), "public", "StitchMint_Pattern_Template.jpg"),
    path.join(process.cwd(), "public", "pattern-cover-bg.png"),
    path.join(process.cwd(), "public", "pattern-cover-bg.jpg"),
    path.join(process.cwd(), "public", "pattern-cover-bg.webp"),
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const buffer = fs.readFileSync(filePath);
      const meta = await sharp(buffer).metadata();
      if (!meta.width || !meta.height) continue;
      return { buffer, width: meta.width, height: meta.height };
    } catch {
      continue;
    }
  }
  return null;
}

function drawCoverPageBackground(doc: PdfDoc, bg: CoverBackgroundImage) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const scale = Math.max(pageW / bg.width, pageH / bg.height);
  const dw = bg.width * scale;
  const dh = bg.height * scale;
  const x = (pageW - dw) / 2;
  const y = (pageH - dh) / 2;
  doc.save();
  doc.image(bg.buffer, x, y, { width: dw, height: dh });
  doc.restore();
}

/** When a raster template is behind the cover, draw an opaque card so type and thumbnails do not print on the artwork. */
function drawCoverContentPanel(doc: PdfDoc) {
  const inset = 32;
  const top = 24;
  /** Nearly full page so stats + disclaimer stay on the card, not on the template. */
  const panelH = doc.page.height - top - 32;
  doc.save();
  doc.fillOpacity(0.96);
  doc.fillColor("#fdf9f3");
  doc.roundedRect(inset, top, doc.page.width - inset * 2, panelH, 12).fill();
  doc.restore();
  doc.save();
  doc.strokeColor("#e8dfd4").lineWidth(0.75).roundedRect(inset, top, doc.page.width - inset * 2, panelH, 12).stroke();
  doc.restore();
  doc.fillOpacity(1);
  doc.y = top + 20;
}

function drawCover(
  doc: PdfDoc,
  meta: PatternPdfMeta,
  opts: { original?: Buffer; preview: Buffer },
  coverBackground: CoverBackgroundImage | null,
) {
  const { widthIn, heightIn } = finishedSizeInches(meta.stitchWidth, meta.stitchHeight, meta.fabricCount);
  const cut = recommendedFabricCut(widthIn, heightIn);

  if (coverBackground) {
    drawCoverPageBackground(doc, coverBackground);
    drawCoverContentPanel(doc);
  }

  doc.fillColor("#2c2416");
  doc.fontSize(26).text("StitchMint Pattern", { align: "center" });
  doc.moveDown(0.4);
  doc.fontSize(18).text(meta.title, { align: "center" });
  doc.moveDown(1);

  const thumbW = 160;
  const gap = 24;
  const startX = (doc.page.width - thumbW * 2 - gap) / 2;
  const y = doc.y;

  if (opts.original) {
    try {
      doc.image(opts.original, startX, y, { width: thumbW, height: thumbW, fit: [thumbW, thumbW], align: "center" });
    } catch {
      doc.rect(startX, y, thumbW, thumbW).stroke("#d8cfc0");
    }
  } else {
    doc.rect(startX, y, thumbW, thumbW).stroke("#d8cfc0");
  }
  doc.fontSize(9).fillColor("#5c5346").text("Your photo", startX, y + thumbW + 6, { width: thumbW, align: "center" });

  try {
    doc.image(opts.preview, startX + thumbW + gap, y, {
      width: thumbW,
      height: thumbW,
      fit: [thumbW, thumbW],
      align: "center",
    });
  } catch {
    doc.rect(startX + thumbW + gap, y, thumbW, thumbW).stroke("#d8cfc0");
  }
  doc
    .fontSize(9)
    .text("Stitched preview", startX + thumbW + gap, y + thumbW + 6, { width: thumbW, align: "center" });

  doc.y = y + thumbW + 40;
  doc.moveDown(1);
  doc.fontSize(11).fillColor("#2c2416");
  doc.text(`Grid: ${meta.stitchWidth} × ${meta.stitchHeight} stitches`);
  doc.text(`Fabric: ${meta.fabricCount}-count Aida`);
  doc.text(
    `Finished size: ${widthIn.toFixed(2)} in × ${heightIn.toFixed(2)} in (${inchesToCm(widthIn).toFixed(1)} × ${inchesToCm(heightIn).toFixed(1)} cm)`,
  );
  doc.text(`Suggested fabric cut (includes margin): about ${cut.widthIn} in × ${cut.heightIn} in`);
  doc.text(`DMC colors in chart: ${meta.colorCount}`);
  doc.text(`Estimated total stitches: ${meta.totalStitches.toLocaleString()}`);
  doc.text(`Stitchability score: ${meta.stitchabilityScore}/100 (${meta.difficultyLabel})`);
  doc.moveDown();
  doc.fontSize(9).fillColor("#6b5f52");
  doc.text(
    "This chart is an artistic interpretation. Thread colors are matched to DMC shades; results vary with fabric, dye lots, lighting, and technique.",
    { width: doc.page.width - 100, align: "left" },
  );
  doc.moveDown(0.5);
  doc.text("© StitchMint. Personal use only unless a commercial license is purchased separately.", {
    width: doc.page.width - 100,
  });
}

function drawInstructions(doc: PdfDoc) {
  doc.addPage();
  doc.fontSize(20).fillColor("#2c2416").text("How to use your chart", { align: "left" });
  doc.moveDown();
  doc.fontSize(11).fillColor("#3a3228");
  const blocks = [
    "Fabric count tells you how many stitches fit in one inch. Higher counts mean smaller stitches and a smaller finished piece for the same chart.",
    "Each square on the chart is one cross stitch. Follow the row and column guides along the edges.",
    "Symbols inside each square tell you which thread color to use. Match the symbol to the legend.",
    "Start from the center of your fabric unless you prefer another starting point. Many stitchers grid their fabric lightly with a washable pen.",
    "Use the thread legend for shopping. Always compare floss at the shop when possible—dye lots vary.",
    "Before you buy supplies, double-check colors against the legend in good lighting.",
  ];
  for (const b of blocks) {
    doc.text(b, { width: doc.page.width - 80, align: "left" });
    doc.moveDown(0.6);
  }
}

function drawLegend(doc: PdfDoc, palette: PatternColorRow[]) {
  doc.addPage();
  doc.fontSize(20).fillColor("#2c2416").text("Thread legend", { align: "left" });
  doc.moveDown(0.8);
  const left = 50;
  let y = doc.y;
  const rowH = 22;
  doc.fontSize(10);
  doc.text("Symbol", left, y, { width: 50 });
  doc.text("DMC", left + 55, y, { width: 50 });
  doc.text("Name", left + 110, y, { width: 220 });
  doc.text("Stitches", left + 340, y, { width: 60 });
  doc.text("Skeins*", left + 410, y, { width: 60 });
  y += rowH;
  doc.moveTo(left, y).lineTo(doc.page.width - 50, y).stroke("#d8cfc0");
  y += 6;
  for (const row of palette) {
    if (y > doc.page.height - 80) {
      doc.addPage();
      y = 60;
    }
    doc.save();
    doc.fillColor(`#${row.hex}`).rect(left, y - 2, 16, 16).fill();
    doc.strokeColor("#c9bfb0").rect(left, y - 2, 16, 16).stroke();
    doc.restore();
    doc.fillColor("#2c2416").fontSize(10).text(row.symbol, left + 22, y, { width: 40 });
    doc.text(row.dmcNumber, left + 55, y, { width: 50 });
    doc.text(row.dmcName, left + 110, y, { width: 220 });
    doc.text(String(row.stitchCount), left + 340, y, { width: 60 });
    doc.text(String(row.estimatedSkeins), left + 410, y, { width: 60 });
    y += rowH;
  }
  doc.moveDown(1);
  doc.fontSize(8).fillColor("#6b5f52").text("*Skein estimates are approximate.", left, y);
}

function drawChartPages(doc: PdfDoc, grid: number[][], palette: PatternColorRow[], variant: ChartVariant) {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  const cfg = variant === "large" ? CHART_PAGE_LARGE : CHART_PAGE_REGULAR;
  const PW = cfg.cols;
  const PH = cfg.rows;
  const O = cfg.overlap;
  const margin = 40;
  const labelCol = variant === "large" ? 34 : 28;
  const labelRow = variant === "large" ? 26 : 22;
  const usableW = doc.page.width - margin * 2 - labelCol;
  const usableH = doc.page.height - margin * 2 - labelRow;
  const cell = Math.min(variant === "large" ? 12 : 8, Math.floor(Math.min(usableW / PW, usableH / PH)));

  let pageIndex = 0;
  for (let startY = 0; startY < H; startY += PH - O) {
    for (let startX = 0; startX < W; startX += PW - O) {
      pageIndex++;
      doc.addPage();
      doc.fontSize(10).fillColor("#5c5346").text(`Chart ${pageIndex} — rows ${startY + 1}–${Math.min(H, startY + PH)}`, margin, margin - 10);

      const originX = margin + labelCol;
      const originY = margin + labelRow;

      // Column guides (every 10)
      doc.save();
      doc.fontSize(variant === "large" ? 7 : 6).fillColor("#7a6f62");
      for (let c = 0; c < PW && startX + c < W; c++) {
        const gx = originX + c * cell;
        const colNum = startX + c + 1;
        if (colNum % 10 === 1 || colNum % 10 === 0) {
          doc.text(String(colNum), gx, originY - 14, { width: cell, align: "center" });
        }
      }
      doc.restore();

      for (let r = 0; r < PH && startY + r < H; r++) {
        const rowNum = startY + r + 1;
        if (rowNum % 10 === 1 || rowNum % 10 === 0) {
          doc.fontSize(variant === "large" ? 7 : 6).fillColor("#7a6f62").text(String(rowNum), margin, originY + r * cell + cell * 0.35, {
            width: labelCol - 6,
            align: "right",
          });
        }
        for (let c = 0; c < PW && startX + c < W; c++) {
          const idx = grid[startY + r]![startX + c]!;
          const col = palette[idx]!;
          const gx = originX + c * cell;
          const gy = originY + r * cell;
          const isOverlapCol = c < O && startX > 0;
          const isOverlapRow = r < O && startY > 0;
          const overlap = isOverlapCol || isOverlapRow;
          doc.save();
          doc.lineWidth(overlap ? 0.85 : 0.35);
          doc.strokeColor(overlap ? "#c49a6c" : "#e3d9cf");
          doc.fillColor("#fffdf8").rect(gx, gy, cell, cell).fill();
          doc.rect(gx, gy, cell, cell).stroke();
          doc.restore();
          doc.fillColor("#1f1a14").fontSize(variant === "large" ? 8 : 5.5).text(col.symbol, gx, gy + cell * 0.28, {
            width: cell,
            align: "center",
          });
        }
      }

      doc.fontSize(8).fillColor("#9a8f82").text("Overlap pages using shaded border columns/rows when present.", margin, doc.page.height - 36, {
        width: doc.page.width - margin * 2,
        align: "left",
      });
    }
  }
}

export async function buildPatternPdf(params: {
  meta: PatternPdfMeta;
  grid: number[][];
  palette: PatternColorRow[];
  variant: ChartVariant;
  originalImage?: Buffer;
  previewImage: Buffer;
  /** When omitted, loads once from public / env (see loadPatternCoverBackground). */
  coverBackground?: CoverBackgroundImage | null;
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: 36, bufferPages: true });
  const done = collectPdfBuffer(doc);

  const coverBg =
    params.coverBackground !== undefined ? params.coverBackground : await loadPatternCoverBackground();

  drawCover(doc, params.meta, { original: params.originalImage, preview: params.previewImage }, coverBg);
  drawInstructions(doc);
  drawLegend(doc, params.palette);
  drawChartPages(doc, params.grid, params.palette, params.variant);

  doc.end();
  return done;
}

export async function buildThreadShoppingListPdf(palette: PatternColorRow[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: 48 });
  const done = collectPdfBuffer(doc);
  doc.fontSize(22).fillColor("#2c2416").text("Thread shopping list", { align: "left" });
  doc.moveDown();
  doc.fontSize(10).fillColor("#5c5346").text("DMC Six-Strand Embroidery Floss — check colors in store when possible.");
  doc.moveDown(1);
  let y = doc.y;
  const left = 50;
  doc.fontSize(10).text("☐", left, y, { width: 20 });
  doc.text("DMC", left + 30, y, { width: 60 });
  doc.text("Color name", left + 100, y, { width: 320 });
  doc.text("Skeins (est.)", left + 430, y, { width: 80 });
  y += 22;
  doc.moveTo(left, y).lineTo(doc.page.width - 50, y).stroke("#d8cfc0");
  y += 10;
  for (const row of palette) {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = 60;
    }
    doc.rect(left, y - 2, 14, 14).fill(`#${row.hex}`).stroke("#c9bfb0");
    doc.fillColor("#2c2416").text("☐", left + 22, y, { width: 20 });
    doc.text(row.dmcNumber, left + 50, y, { width: 60 });
    doc.text(row.dmcName, left + 120, y, { width: 300 });
    doc.text(String(row.estimatedSkeins), left + 440, y, { width: 60 });
    y += 22;
  }
  doc.end();
  return done;
}

export async function buildReadMeFirstPdf(): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: 56 });
  const done = collectPdfBuffer(doc);
  doc.fontSize(24).fillColor("#2c2416").text("Read me first", { align: "left" });
  doc.moveDown();
  doc.fontSize(11).fillColor("#3a3228");
  const sections = [
    "Printing: print chart pages at 100% scale. Do not shrink to fit unless a page overflows—if it does, split across prints carefully.",
    "Reading the chart: each square is one full cross stitch. Use the legend to match symbols to DMC colors.",
    "Fabric: Aida is beginner-friendly. Your pattern notes the count you selected.",
    "Needle: a size 24 tapestry needle is a common choice for 14–18 count Aida.",
    "Disclaimer: your finished piece will reflect your fabric, floss dye lots, lighting, and stitching style. This chart is a guide, not a guarantee.",
    `Questions: ${process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "hello@stitchmint.example"}`,
  ];
  for (const s of sections) {
    doc.text(s, { width: doc.page.width - 112, align: "left" });
    doc.moveDown(0.8);
  }
  doc.end();
  return done;
}
