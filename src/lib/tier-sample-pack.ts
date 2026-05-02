import JSZip from "jszip";
import { PRICING_TIERS } from "@/config/pricing";
import { buildZipForPattern, runPatternGeneration, type PatternSettings } from "@/lib/pattern-service";

function tierZipFilename(tierId: string): string {
  return tierId === "plus" ? "premium.zip" : `${tierId}.zip`;
}

/** One customer-style ZIP per tier (Basic / Premium=Plus / Pro). */
export async function buildTierSampleZipEntries(
  imageBuffer: Buffer,
  baseTitle: string,
): Promise<{ filename: string; data: Buffer }[]> {
  const entries: { filename: string; data: Buffer }[] = [];
  for (const tier of PRICING_TIERS) {
    const settings: PatternSettings = {
      title: `${baseTitle} — ${tier.name}`,
      crop: { x: 0, y: 0, width: 100, height: 100 },
      stitchWidth: tier.engine.stitchWidth,
      detailLevel: tier.engine.detailLevel,
      fabricCount: 14,
    };
    const pattern = await runPatternGeneration(imageBuffer, settings);
    const zip = await buildZipForPattern(imageBuffer, settings, pattern);
    entries.push({ filename: tierZipFilename(tier.id), data: zip });
  }
  return entries;
}

/** Single download: outer ZIP containing basic.zip, premium.zip, pro.zip. */
export async function buildTierSamplesMegaZip(imageBuffer: Buffer, baseTitle: string): Promise<Buffer> {
  const inner = await buildTierSampleZipEntries(imageBuffer, baseTitle);
  const outer = new JSZip();
  for (const { filename, data } of inner) {
    outer.file(filename, data);
  }
  return outer.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
