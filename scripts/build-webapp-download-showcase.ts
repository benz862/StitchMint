/**
 * Build one ZIP with every tier’s full web-app download (bundles + unpacked).
 *
 *   npm run sample:webapp-showcase -- path/to/photo.jpg [output-dir]
 *
 * Writes StitchMint-webapp-download-showcase-<slug>.zip into output-dir (default ./webapp-showcase-out).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildWebappDownloadShowcaseZip } from "../src/lib/webapp-download-showcase";

async function main() {
  const imagePath = process.argv[2];
  const outDir = path.resolve(process.argv[3] ?? "./webapp-showcase-out");
  if (!imagePath) {
    console.error("Usage: npm run sample:webapp-showcase -- <image-path> [output-dir]");
    process.exit(1);
  }
  const resolved = path.resolve(imagePath);
  const imageBuffer = await readFile(resolved);
  const baseTitle = path.basename(resolved, path.extname(resolved)).replace(/[^\w\s-]+/g, "").trim() || "Sample";

  await mkdir(outDir, { recursive: true });
  process.stdout.write("Building showcase (3 tiers × bundle + unpacked)… ");
  const zip = await buildWebappDownloadShowcaseZip(imageBuffer, baseTitle);
  const slug = baseTitle.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");
  const outFile = path.join(outDir, `StitchMint-webapp-download-showcase-${slug}.zip`);
  await writeFile(outFile, zip);
  console.log(outFile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
