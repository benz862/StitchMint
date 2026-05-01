/** Preset detail levels: caps palette size and processing intensity. */
export const DETAIL_LEVELS = {
  beginner: {
    id: "beginner",
    label: "Beginner",
    description: "Easiest to stitch — best for simple images",
    maxColors: 15,
    defaultStitchWidth: 80,
    colorHint: "10–15 DMC colors",
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    description: "Our most-loved setting — great for gifts",
    maxColors: 28,
    defaultStitchWidth: 120,
    colorHint: "20–30 DMC colors",
  },
  detailed: {
    id: "detailed",
    label: "Detailed",
    description: "Rich detail for portraits and pets",
    maxColors: 45,
    defaultStitchWidth: 160,
    colorHint: "35–50 DMC colors",
  },
  expert: {
    id: "expert",
    label: "Expert",
    description: "Maximum nuance for experienced stitchers",
    maxColors: 72,
    defaultStitchWidth: 200,
    colorHint: "60–80 DMC colors",
  },
} as const;

export type DetailLevelId = keyof typeof DETAIL_LEVELS;

export const STITCH_WIDTHS = [
  { id: "small", label: "Small", stitches: 80 },
  { id: "medium", label: "Medium", stitches: 120 },
  { id: "large", label: "Large", stitches: 160 },
  { id: "xl", label: "Extra large", stitches: 200 },
] as const;

export type StitchWidthId = (typeof STITCH_WIDTHS)[number]["id"];

export const FABRIC_COUNTS = [
  { count: 14, label: "14-count Aida" },
  { count: 16, label: "16-count Aida" },
  { count: 18, label: "18-count Aida" },
] as const;

/** Stitches per chart page (regular print). */
export const CHART_PAGE_REGULAR = { cols: 60, rows: 70, overlap: 2 };

/** Stitches per chart page (large print). */
export const CHART_PAGE_LARGE = { cols: 40, rows: 40, overlap: 2 };

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const DEFAULT_PATTERN_PRICE_CENTS = 995;

export const DOWNLOAD_EXPIRY_DAYS = 7;

/** Symbol pool: avoids easily confused glyphs. */
export const SYMBOL_POOL =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#%&*+=?~[]";
