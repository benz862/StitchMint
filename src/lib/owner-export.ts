import JSZip from "jszip";
import { PRICING_TIERS, type PricingTierId } from "@/config/pricing";
import {
  buildZipForPattern,
  runPatternGeneration,
  type PatternRowForGeneration,
  type PatternSettings,
} from "@/lib/pattern-service";

const OWNER_EXPORT_FOLDERS: Record<PricingTierId, string> = {
  basic: "Basic-80x80",
  plus: "Premium-120x120",
  pro: "Pro-200x200",
};

export type AllSizesPatternZipInput = {
  originalBuffer: Buffer;
  title: string;
  crop: PatternSettings["crop"];
  aspectRatio?: number;
  fabricCount: number;
  /** The saved pattern row, supplied so its text-overlay draft is preserved. */
  row?: PatternRowForGeneration;
};

/**
 * Builds one owner ZIP containing the app's normal deliverable set for every
 * pricing tier. Each tier is generated with the existing pattern engine and
 * packaged with buildZipForPattern first; those finished files are then copied
 * into the required per-tier folder in the outer ZIP.
 */
export async function buildAllSizesPatternZip(input: AllSizesPatternZipInput): Promise<Buffer> {
  const outer = new JSZip();

  for (const tier of PRICING_TIERS) {
    const settings: PatternSettings = {
      title: `${input.title} — ${tier.name}`,
      crop: input.crop,
      aspectRatio: input.aspectRatio,
      stitchWidth: tier.engine.stitchWidth,
      detailLevel: tier.engine.detailLevel,
      fabricCount: input.fabricCount,
    };

    const pattern = await runPatternGeneration(input.originalBuffer, settings, input.row);
    const tierZip = await buildZipForPattern(input.originalBuffer, settings, pattern);
    const inner = await JSZip.loadAsync(tierZip);
    const folder = outer.folder(OWNER_EXPORT_FOLDERS[tier.id]);
    if (!folder) throw new Error(`Could not create export folder for ${tier.name}`);

    for (const entry of Object.values(inner.files)) {
      if (entry.dir) continue;
      folder.file(entry.name, await entry.async("nodebuffer"));
    }
  }

  return outer.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/**
 * Owner-only Mini size: 64 stitches wide — exactly 4 inches on 16-count Aida
 * (height follows the image's aspect ratio, like every other size). Uses the
 * Basic engine's detail level, which suits small, simple designs. Returns the
 * app's normal single-size deliverable ZIP on its own.
 */
export const MINI_STITCH_WIDTH = 64;

export async function buildMiniPatternZip(input: AllSizesPatternZipInput): Promise<Buffer> {
  const settings: PatternSettings = {
    title: `${input.title} — Mini Pattern`,
    crop: input.crop,
    aspectRatio: input.aspectRatio,
    stitchWidth: MINI_STITCH_WIDTH,
    detailLevel: "beginner",
    fabricCount: input.fabricCount,
  };

  const pattern = await runPatternGeneration(input.originalBuffer, settings, input.row);
  return buildZipForPattern(input.originalBuffer, settings, pattern);
}
