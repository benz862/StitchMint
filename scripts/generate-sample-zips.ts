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
import { buildTierSampleZipEntries } from "../src/lib/tier-sample-pack";

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

  const entries = await buildTierSampleZipEntries(imageBuffer, baseTitle);
  for (const { filename, data } of entries) {
    process.stdout.write(`Writing ${filename}… `);
    const outFile = path.join(outDir, filename);
    await writeFile(outFile, data);
    console.log(outFile);
  }
  console.log(`Done. Open ${outDir}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
