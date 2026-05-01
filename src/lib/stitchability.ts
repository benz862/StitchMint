/**
 * Composite score 1–100: higher is easier to stitch.
 */
export function computeStitchabilityScore(input: {
  colorCount: number;
  stitchWidth: number;
  stitchHeight: number;
  isolatedStitches: number;
  avgBlockSize: number;
}): number {
  const { colorCount, stitchWidth, stitchHeight, isolatedStitches, avgBlockSize } = input;
  const total = stitchWidth * stitchHeight;
  let score = 100;

  // More colors → harder
  score -= Math.min(35, (colorCount - 8) * 0.9);

  // Confetti density
  const confettiRatio = total > 0 ? isolatedStitches / total : 0;
  score -= Math.min(30, confettiRatio * 900);

  // Smaller average block → fussier
  if (avgBlockSize > 0) {
    score -= Math.min(20, 80 / avgBlockSize);
  }

  // Larger piece → more commitment
  const mega = total / 40000;
  score -= Math.min(15, mega * 10);

  return Math.max(1, Math.min(100, Math.round(score)));
}

export function difficultyLabel(score: number): string {
  if (score >= 80) return "Gentle";
  if (score >= 65) return "Comfortable";
  if (score >= 50) return "Moderate";
  if (score >= 35) return "Challenging";
  return "Ambitious";
}

/** Average contiguous block size (4-connected) per color bucketed as one pass. */
export function averageBlockSize(dmcGrid: number[][]): number {
  const h = dmcGrid.length;
  const w = dmcGrid[0]?.length ?? 0;
  if (!h || !w) return 0;
  const seen = Array.from({ length: h }, () => new Uint8Array(w));
  const sizes: number[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (seen[y]![x]) continue;
      const target = dmcGrid[y]![x]!;
      let area = 0;
      const stack: [number, number][] = [[x, y]];
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
        if (seen[cy]![cx]) continue;
        if (dmcGrid[cy]![cx] !== target) continue;
        seen[cy]![cx] = 1;
        area++;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      sizes.push(area);
    }
  }

  const sum = sizes.reduce((a, b) => a + b, 0);
  return sum / sizes.length;
}
