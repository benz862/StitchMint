import { deltaE76, rgbToLab, type RGB } from "@/lib/color";

export type GridCell = { dmcIndex: number };

/**
 * Reduce isolated single stitches ("confetti") when surrounded by a strong majority.
 * Skips high-contrast neighborhoods (likely edges / eyes / text) using local variance.
 */
export function reduceConfetti(
  grid: GridCell[][],
  paletteRgb: RGB[],
  options?: { maxDeltaE?: number; minMajority?: number },
): { grid: GridCell[][]; isolatedBefore: number; isolatedAfter: number } {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const maxDeltaE = options?.maxDeltaE ?? 12;
  const minMajority = options?.minMajority ?? 5;

  const out: GridCell[][] = grid.map((row) => row.map((c) => ({ ...c })));

  const countIsolated = (g: GridCell[][]) => {
    let iso = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const self = g[y]![x]!.dmcIndex;
        let same = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (g[y + dy]![x + dx]!.dmcIndex === self) same++;
          }
        }
        if (same === 0) iso++;
      }
    }
    return iso;
  };

  const isolatedBefore = countIsolated(grid);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const selfIdx = out[y]![x]!.dmcIndex;
      const neigh: number[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          neigh.push(out[y + dy]![x + dx]!.dmcIndex);
        }
      }
      const counts = new Map<number, number>();
      for (const idx of neigh) counts.set(idx, (counts.get(idx) ?? 0) + 1);
      let majorityIdx = -1;
      let majorityCount = 0;
      for (const [idx, c] of counts) {
        if (c > majorityCount) {
          majorityCount = c;
          majorityIdx = idx;
        }
      }
      if (majorityIdx === selfIdx || majorityIdx < 0) continue;
      if (majorityCount < minMajority) continue;

      const cSelf = paletteRgb[selfIdx]!;
      const cMaj = paletteRgb[majorityIdx]!;
      const labS = rgbToLab(cSelf);
      const labM = rgbToLab(cMaj);
      if (deltaE76(labS, labM) > maxDeltaE) continue;

      // Local color variance — avoid smearing sharp edges
      const labs = neigh.map((i) => rgbToLab(paletteRgb[i]!));
      let meanL = 0,
        meanA = 0,
        meanB = 0;
      for (const l of labs) {
        meanL += l[0];
        meanA += l[1];
        meanB += l[2];
      }
      meanL /= labs.length;
      meanA /= labs.length;
      meanB /= labs.length;
      let varSum = 0;
      for (const l of labs) {
        const dL = l[0] - meanL;
        const da = l[1] - meanA;
        const db = l[2] - meanB;
        varSum += dL * dL + da * da + db * db;
      }
      const variance = varSum / labs.length;
      if (variance > 220) continue; // busy neighborhood — keep detail

      const selfNeighborsSame = neigh.filter((i) => i === selfIdx).length;
      if (selfNeighborsSame > 0) continue;

      out[y]![x]!.dmcIndex = majorityIdx;
    }
  }

  const isolatedAfter = countIsolated(out);
  return { grid: out, isolatedBefore, isolatedAfter };
}
