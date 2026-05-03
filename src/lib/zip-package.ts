import JSZip from "jszip";
import type { PatternColorRow, PatternResult } from "@/lib/pattern-engine";
import {
  buildPatternPdf,
  buildReadMeFirstPdf,
  buildThreadShoppingListPdf,
  loadPatternCoverBackground,
  type PatternPdfMeta,
} from "@/lib/pattern-pdf";

export async function buildPatternZipArchive(input: {
  title: string;
  pattern: PatternResult;
  originalImage?: Buffer;
}): Promise<Buffer> {
  const meta: PatternPdfMeta = {
    title: input.title,
    fabricCount: input.pattern.fabricCount,
    stitchWidth: input.pattern.stitchWidth,
    stitchHeight: input.pattern.stitchHeight,
    totalStitches: input.pattern.totalStitches,
    colorCount: input.pattern.colorCount,
    stitchabilityScore: input.pattern.stitchabilityScore,
    difficultyLabel: input.pattern.difficultyLabel,
  };

  const coverBg = await loadPatternCoverBackground();
  const [regular, large, shopping, readme] = await Promise.all([
    buildPatternPdf({
      meta,
      grid: input.pattern.grid,
      palette: input.pattern.palette,
      variant: "regular",
      originalImage: input.originalImage,
      previewImage: input.pattern.previewPng,
      coverBackground: coverBg,
    }),
    buildPatternPdf({
      meta,
      grid: input.pattern.grid,
      palette: input.pattern.palette,
      variant: "large",
      originalImage: input.originalImage,
      previewImage: input.pattern.previewPng,
      coverBackground: coverBg,
    }),
    buildThreadShoppingListPdf(input.pattern.palette, coverBg),
    buildReadMeFirstPdf(coverBg),
  ]);

  const zip = new JSZip();
  zip.file("Pattern-Regular.pdf", regular);
  zip.file("Pattern-Large-Print.pdf", large);
  zip.file("Thread-Shopping-List.pdf", shopping);
  zip.file("Preview.png", input.pattern.previewPng);
  zip.file("Read-Me-First.pdf", readme);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export type { PatternColorRow };
