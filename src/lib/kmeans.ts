import type { RGB } from "@/lib/color";

/**
 * Lightweight k-means on RGB pixels for palette reduction.
 * Uses random seed centroids and limited iterations for speed.
 */
export function kMeansPixels(
  pixels: RGB[],
  k: number,
  options?: { iterations?: number; seed?: number },
): { centers: RGB[]; labels: Uint16Array } {
  const n = pixels.length;
  if (n === 0) {
    return { centers: [], labels: new Uint16Array(0) };
  }
  const iterations = options?.iterations ?? 12;
  const unique = new Map<string, RGB>();
  for (const p of pixels) {
    unique.set(`${p.r},${p.g},${p.b}`, p);
  }
  const kActual = Math.min(k, Math.max(1, unique.size));
  const centers: RGB[] = [];
  const rng = mulberry32(options?.seed ?? 0x9e3779b9);

  const uniqArr = [...unique.values()];
  const picked = new Set<number>();
  while (centers.length < kActual) {
    const idx = Math.floor(rng() * uniqArr.length);
    if (picked.has(idx)) continue;
    picked.add(idx);
    const c = uniqArr[idx]!;
    centers.push({ r: c.r, g: c.g, b: c.b });
  }

  const labels = new Uint16Array(n);

  for (let it = 0; it < iterations; it++) {
    // assign
    for (let i = 0; i < n; i++) {
      const p = pixels[i]!;
      let best = 0;
      let bestD = Infinity;
      for (let j = 0; j < centers.length; j++) {
        const c = centers[j]!;
        const d = distSq(p, c);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      labels[i] = best;
    }
    // update
    const sumR = new Float64Array(kActual);
    const sumG = new Float64Array(kActual);
    const sumB = new Float64Array(kActual);
    const cnt = new Float64Array(kActual);
    for (let i = 0; i < n; i++) {
      const lab = labels[i]!;
      const p = pixels[i]!;
      sumR[lab] += p.r;
      sumG[lab] += p.g;
      sumB[lab] += p.b;
      cnt[lab] += 1;
    }
    for (let j = 0; j < kActual; j++) {
      if (cnt[j]! > 0) {
        centers[j] = {
          r: Math.round(sumR[j]! / cnt[j]!),
          g: Math.round(sumG[j]! / cnt[j]!),
          b: Math.round(sumB[j]! / cnt[j]!),
        };
      }
    }
  }

  return { centers, labels };
}

function distSq(a: RGB, b: RGB): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
