import JSZip from "jszip";
import { PRICING_TIERS } from "@/config/pricing";
import { buildZipForPattern, runPatternGeneration, type PatternSettings } from "@/lib/pattern-service";
import type { CropPercent } from "@/lib/pattern-engine";
import type { TextOverlaySpec } from "@/lib/canvas-crop-text";

/** Default crop = use the whole image; admin builder can supply a real percentage crop with margins. */
const DEFAULT_FULL_CROP: CropPercent = { x: 0, y: 0, width: 100, height: 100 };

export type SamplePackComposition = {
  /** Crop in % of original image (may extend outside [0,100] for margins, mirroring the editor). */
  crop?: CropPercent;
  /** Optional title overlay to bake into every tier's pattern (anchorX/Y in % of crop frame). */
  overlay?: TextOverlaySpec | null;
};

function tierZipFilename(tierId: string): string {
  return tierId === "plus" ? "premium.zip" : `${tierId}.zip`;
}

/** One customer-style ZIP per tier (Basic / Premium=Plus / Pro). */
export async function buildTierSampleZipEntries(
  imageBuffer: Buffer,
  baseTitle: string,
  composition?: SamplePackComposition,
): Promise<{ filename: string; data: Buffer }[]> {
  const entries: { filename: string; data: Buffer }[] = [];
  const crop = composition?.crop ?? DEFAULT_FULL_CROP;
  const overlay = composition?.overlay ?? null;
  for (const tier of PRICING_TIERS) {
    const settings: PatternSettings = {
      title: `${baseTitle} — ${tier.name}`,
      crop,
      stitchWidth: tier.engine.stitchWidth,
      detailLevel: tier.engine.detailLevel,
      fabricCount: 14,
      overlay,
    };
    const pattern = await runPatternGeneration(imageBuffer, settings);
    const zip = await buildZipForPattern(imageBuffer, settings, pattern);
    entries.push({ filename: tierZipFilename(tier.id), data: zip });
  }
  return entries;
}

/** Single download: outer ZIP containing basic.zip, premium.zip, pro.zip. */
export async function buildTierSamplesMegaZip(
  imageBuffer: Buffer,
  baseTitle: string,
  composition?: SamplePackComposition,
): Promise<Buffer> {
  const inner = await buildTierSampleZipEntries(imageBuffer, baseTitle, composition);
  const outer = new JSZip();
  for (const { filename, data } of inner) {
    outer.file(filename, data);
  }
  return outer.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
