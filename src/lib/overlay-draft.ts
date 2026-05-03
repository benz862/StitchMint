import type { TextOverlaySpec, TextTypography } from "@/lib/canvas-crop-text";
import { defaultTextTypography } from "@/lib/canvas-crop-text";

export const OVERLAY_DRAFT_VERSION = 1 as const;

export type OverlayDraftV1 = {
  v: typeof OVERLAY_DRAFT_VERSION;
  text: string;
  anchorX: number;
  anchorY: number;
  typography: TextTypography;
  color: string;
};

function mergeTypography(raw: unknown): TextTypography {
  const d = defaultTextTypography();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  return {
    fontId: typeof o.fontId === "string" ? o.fontId : d.fontId,
    fontWeight: typeof o.fontWeight === "number" && Number.isFinite(o.fontWeight) ? o.fontWeight : d.fontWeight,
    italic: typeof o.italic === "boolean" ? o.italic : d.italic,
    underline: typeof o.underline === "boolean" ? o.underline : d.underline,
    outline: typeof o.outline === "boolean" ? o.outline : d.outline,
    sizeScale: typeof o.sizeScale === "number" && Number.isFinite(o.sizeScale) ? o.sizeScale : d.sizeScale,
  };
}

/** Parse DB `overlay_draft` into a canvas/server overlay spec, or null if absent/invalid. */
export function parseOverlayDraftForServer(raw: unknown): TextOverlaySpec | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== OVERLAY_DRAFT_VERSION) return null;
  const text = typeof o.text === "string" ? o.text.trim() : "";
  if (!text) return null;
  const anchorX = typeof o.anchorX === "number" && Number.isFinite(o.anchorX) ? o.anchorX : 50;
  const anchorY = typeof o.anchorY === "number" && Number.isFinite(o.anchorY) ? o.anchorY : 50;
  const color = typeof o.color === "string" && o.color.trim() ? o.color.trim() : "#ffffff";
  const typography = mergeTypography(o.typography);
  return { text, anchorX, anchorY, typography, color };
}

export function buildOverlayDraftV1(spec: {
  text: string;
  anchorX: number;
  anchorY: number;
  typography: TextTypography;
  color: string;
}): OverlayDraftV1 {
  return {
    v: OVERLAY_DRAFT_VERSION,
    text: spec.text.trim(),
    anchorX: spec.anchorX,
    anchorY: spec.anchorY,
    typography: spec.typography,
    color: spec.color,
  };
}
