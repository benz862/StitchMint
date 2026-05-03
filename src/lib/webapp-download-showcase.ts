import JSZip from "jszip";
import { PRICING_TIERS } from "@/config/pricing";
import { buildZipForPattern, runPatternGeneration, type PatternSettings } from "@/lib/pattern-service";

const README = `StitchMint — Web app download showcase
==========================================

This archive shows what customers receive after purchase: one ZIP per pricing
tier, each with the same file layout as the live app download.

bundles/
  Each *-complete-download.zip is exactly what a paid download would contain
  for that tier (same filenames and contents).

unpacked/
  The same five files per tier, unpacked so you can open PDFs without
  unzipping three times.

Files inside each bundle
------------------------
  Pattern-Regular.pdf
  Pattern-Large-Print.pdf
  Thread-Shopping-List.pdf
  Read-Me-First.pdf
  Preview.png
`;

function tierFolderName(tierId: string): string {
  return tierId === "plus" ? "premium" : tierId;
}

/**
 * One outer ZIP: per-tier complete customer bundles (as produced by the app)
 * plus unpacked copies under unpacked/{basic|premium|pro}/.
 */
export async function buildWebappDownloadShowcaseZip(imageBuffer: Buffer, baseTitle: string): Promise<Buffer> {
  const outer = new JSZip();
  outer.file("README.txt", README);

  for (const tier of PRICING_TIERS) {
    const folder = tierFolderName(tier.id);
    const settings: PatternSettings = {
      title: `${baseTitle} — ${tier.name}`,
      crop: { x: 0, y: 0, width: 100, height: 100 },
      stitchWidth: tier.engine.stitchWidth,
      detailLevel: tier.engine.detailLevel,
      fabricCount: 14,
    };
    const pattern = await runPatternGeneration(imageBuffer, settings);
    const bundleBuf = await buildZipForPattern(imageBuffer, settings, pattern);
    outer.file(`bundles/${folder}-complete-download.zip`, bundleBuf);

    const inner = await JSZip.loadAsync(bundleBuf);
    for (const name of Object.keys(inner.files)) {
      const entry = inner.files[name];
      if (!entry || entry.dir) continue;
      const data = await entry.async("nodebuffer");
      outer.file(`unpacked/${folder}/${name}`, data);
    }
  }

  return outer.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
