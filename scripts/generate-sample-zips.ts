/**
 * Generate three customer-style ZIPs (Basic / Premium=Plus / Pro) from one source image.
 *
 * Usage (from repo root `stitchmint/`):
 *   npm run sample-zips -- path/to/photo.jpg
 *   npm run sample-zips -- path/to/photo.jpg ./tier-samples-out
 *
 * Output: basic.zip, premium.zip (Plus tier engine), pro.zip — same bundle layout as production.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PRICING_TIERS } from "../src/config/pricing";
import { buildZipForPattern, runPatternGeneration, type PatternSettings } from "../src/lib/pattern-service";

async function main() {
  const imagePath = process.argv[2];
  const outDir = path.resolve(process.argv[3] ?? "./tier-samples-out");
  if (!imagePath) {
    console.error("Usage: npm run sample-zips -- <image-path> [output-dir]");
    process.exit(1);
  }
  const resolved = path.resolve(imagePath);
  const imageBuffer = await readFile(resolved);
  const baseTitle = path.basename(resolved, path.extname(resolved)).replace(/[^\w\s-]+/g, "").trim() || "Sample";

  await mkdir(outDir, { recursive: true });

  for (const tier of PRICING_TIERS) {
    const settings: PatternSettings = {
      title: `${baseTitle} — ${tier.name}`,
      crop: { x: 0, y: 0, width: 100, height: 100 },
      stitchWidth: tier.engine.stitchWidth,
      detailLevel: tier.engine.detailLevel,
      fabricCount: 14,
    };
    process.stdout.write(`Generating ${tier.id} (${tier.engine.stitchWidth}w · ${tier.engine.detailLevel})… `);
    const pattern = await runPatternGeneration(imageBuffer, settings);
    const zip = await buildZipForPattern(imageBuffer, settings, pattern);
    const fileName = tier.id === "plus" ? "premium.zip" : `${tier.id}.zip`;
    const outFile = path.join(outDir, fileName);
    await writeFile(outFile, zip);
    console.log(outFile);
  }
  console.log(`Done. Open ${outDir}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
