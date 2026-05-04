import path from "node:path";
import { existsSync } from "node:fs";
import { GlobalFonts } from "@napi-rs/canvas";

/**
 * Font registration for server-side rasterization.
 *
 * On Vercel's Linux serverless runtime there are essentially no usable system fonts — the typical
 * stacks ("Arial", "Helvetica", "Palatino", etc.) all resolve to a fallback that either fails to
 * render or produces blank glyphs, which is why titles disappeared in production previews while
 * working perfectly in local dev (where the Mac/Linux dev box has hundreds of system fonts).
 *
 * Fix: bundle a small set of permissively licensed (SIL OFL / Apache) fonts via @fontsource and
 * register every weight + italic with @napi-rs/canvas's GlobalFonts. The font picker stacks then
 * include these registered family names first, so the same render path works on local AND on
 * serverless without depending on any host-installed fonts.
 *
 * File path strategy: we use literal path.join() with `process.cwd()` (project root on both Vercel
 * and local dev) instead of require.resolve, because Turbopack rejects template-string dynamic
 * resolves. The actual files are guaranteed to be present in node_modules at runtime via:
 *   1. The @fontsource/* packages being declared as dependencies in package.json
 *   2. next.config.ts's outputFileTracingIncludes glob ensuring the .woff files ship with the
 *      serverless function bundle
 */

let registered = false;

type FontFile = { weight: number; italic: boolean; relativePath: string };
type FontFamily = { name: string; files: FontFile[] };

/**
 * Ensure server fonts are registered. Cheap to call repeatedly — the actual registration only runs
 * once per Node process (per serverless instance / dev server). Call this from any code path that
 * is about to draw text on a server-side canvas.
 */
export function ensureServerFontsRegistered(): void {
  if (registered) return;
  registered = true;

  const root = process.cwd();
  const families = buildFamilyManifest();

  for (const family of families) {
    for (const f of family.files) {
      const fullPath = path.join(root, f.relativePath);
      if (!existsSync(fullPath)) {
        console.warn("[server-fonts] font file missing at runtime", { family: family.name, path: fullPath });
        continue;
      }
      try {
        /**
         * registerFromPath uses the font's internal tables to derive weight/style; we pass the
         * family name so user-set CSS stacks ("bold 16px Inter") resolve correctly. Returns null
         * on registration failure (logged so a corrupt/unsupported file is debuggable in prod).
         */
        const ok = GlobalFonts.registerFromPath(fullPath, family.name);
        if (!ok) {
          console.warn("[server-fonts] registerFromPath returned null", { family: family.name, path: fullPath });
        }
      } catch (err) {
        console.warn("[server-fonts] failed to register font", { family: family.name, path: fullPath, err });
      }
    }
  }
}

/** Static manifest of every bundled .woff path. Listed explicitly so Turbopack can stat-check, and so adding a new weight is a one-liner. */
function buildFamilyManifest(): FontFamily[] {
  const interWeights = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const loraWeights = [400, 500, 600, 700];

  const interFiles: FontFile[] = interWeights.flatMap((w) => [
    { weight: w, italic: false, relativePath: `node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff` },
    { weight: w, italic: true, relativePath: `node_modules/@fontsource/inter/files/inter-latin-${w}-italic.woff` },
  ]);
  const loraFiles: FontFile[] = loraWeights.flatMap((w) => [
    { weight: w, italic: false, relativePath: `node_modules/@fontsource/lora/files/lora-latin-${w}-normal.woff` },
    { weight: w, italic: true, relativePath: `node_modules/@fontsource/lora/files/lora-latin-${w}-italic.woff` },
  ]);

  return [
    { name: "Inter", files: interFiles },
    { name: "Lora", files: loraFiles },
    {
      name: "Anton",
      files: [{ weight: 400, italic: false, relativePath: "node_modules/@fontsource/anton/files/anton-latin-400-normal.woff" }],
    },
    {
      name: "RobotoMono",
      files: [
        { weight: 400, italic: false, relativePath: "node_modules/@fontsource/roboto-mono/files/roboto-mono-latin-400-normal.woff" },
        { weight: 700, italic: false, relativePath: "node_modules/@fontsource/roboto-mono/files/roboto-mono-latin-700-normal.woff" },
      ],
    },
  ];
}
