import { parseOverlayDraftForServer } from "@/lib/overlay-draft";
import type { CropPercent } from "@/lib/pattern-engine";
import type { SamplePackComposition } from "@/lib/tier-sample-pack";

/**
 * Parse the `crop` (CropPercent JSON) and `overlay` (OverlayDraftV1 JSON) fields out of an admin
 * sample-pack request and return a `SamplePackComposition` (or `undefined` if neither is present).
 *
 * Throws on malformed JSON or shape mismatches so the API route can return a 400 with a helpful
 * detail instead of silently dropping the user's edits.
 */
export function parseAdminComposition(form: FormData): SamplePackComposition | undefined {
  const cropRaw = form.get("crop");
  const overlayRaw = form.get("overlay");

  const cropValue = typeof cropRaw === "string" ? cropRaw.trim() : "";
  const overlayValue = typeof overlayRaw === "string" ? overlayRaw.trim() : "";

  let crop: CropPercent | undefined;
  if (cropValue) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(cropValue);
    } catch (err) {
      throw new Error(`crop is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    crop = validateCropPercent(parsed);
  }

  let overlay: SamplePackComposition["overlay"];
  if (overlayValue) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(overlayValue);
    } catch (err) {
      throw new Error(`overlay is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    /**
     * Reuse the same parser the customer flow uses on `overlay_draft` so the admin's overlay JSON
     * is identical in shape and validation. Returns null for empty text / wrong version, which we
     * surface as no-overlay rather than throwing — admin may legitimately omit the title.
     */
    overlay = parseOverlayDraftForServer(parsed) ?? null;
  }

  if (!crop && !overlay) return undefined;
  return { crop, overlay };
}

function validateCropPercent(raw: unknown): CropPercent {
  if (!raw || typeof raw !== "object") throw new Error("crop must be an object");
  const o = raw as Record<string, unknown>;
  for (const k of ["x", "y", "width", "height"] as const) {
    if (typeof o[k] !== "number" || !Number.isFinite(o[k])) {
      throw new Error(`crop.${k} must be a finite number`);
    }
  }
  /** Width/height can be > 100 when the user zooms out for margins, but they must be positive. */
  if ((o.width as number) <= 0 || (o.height as number) <= 0) {
    throw new Error("crop.width and crop.height must be > 0");
  }
  return {
    x: o.x as number,
    y: o.y as number,
    width: o.width as number,
    height: o.height as number,
  };
}
