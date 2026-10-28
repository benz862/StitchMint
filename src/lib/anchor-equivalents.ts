import dmcToAnchor from "@/data/dmc-to-anchor.json";

/**
 * Closest-number substitutions for Anchor Stranded Cotton. A conversion is a shopping aid, not a
 * claim of an identical dye colour: customers should compare physical floss before stitching.
 */
const DMC_TO_ANCHOR = dmcToAnchor as Record<string, string | null>;

export function closestAnchorEquivalent(dmcNumber: string): string | null {
  return DMC_TO_ANCHOR[dmcNumber.trim()] ?? null;
}
