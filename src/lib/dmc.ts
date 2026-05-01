import dmcRaw from "@/data/dmc-floss.json";
import { deltaE76, rgbToLab, type RGB } from "@/lib/color";
import { SYMBOL_POOL } from "@/lib/constants";

export type DmcThread = {
  number: string;
  name: string;
  hex: string;
  rgb: RGB;
  lab: [number, number, number];
  /** Optional organizer row from source data */
  family?: string;
};

let cachedThreads: DmcThread[] | null = null;

function normalizeHex(hex: string): string {
  const h = hex.replace("#", "").toUpperCase();
  return h.length === 6 ? h : h.padStart(6, "0");
}

export function loadDmcThreads(): DmcThread[] {
  if (cachedThreads) return cachedThreads;
  const rows = dmcRaw as Array<{
    floss: string;
    description: string;
    hex: string;
    r: number;
    g: number;
    b: number;
    row?: string;
  }>;
  cachedThreads = rows.map((r) => {
    const hex = normalizeHex(r.hex);
    const rgb = { r: r.r, g: r.g, b: r.b };
    return {
      number: String(r.floss),
      name: r.description.replace(/\s+/g, " ").trim(),
      hex,
      rgb,
      lab: rgbToLab(rgb),
      family: r.row,
    };
  });
  return cachedThreads;
}

export function findNearestDmc(rgb: RGB, threads: DmcThread[] = loadDmcThreads()): DmcThread {
  const lab = rgbToLab(rgb);
  let best = threads[0];
  let bestD = Infinity;
  for (const t of threads) {
    const d = deltaE76(lab, t.lab);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

export function assignSymbols(count: number): string[] {
  const out: string[] = [];
  const pool = SYMBOL_POOL.split("");
  for (let i = 0; i < count; i++) {
    if (i < pool.length) {
      out.push(pool[i]!);
    } else {
      const a = pool[Math.floor(i / pool.length) % pool.length]!;
      const b = pool[i % pool.length]!;
      out.push(`${a}${b}`);
    }
  }
  return out;
}

/** Rough skein estimate: ~1800 stitches per 6-strand skein single-thread coverage heuristic */
export function estimateSkeins(stitchCount: number): number {
  const perSkein = 1800;
  return Math.max(1, Math.ceil(stitchCount / perSkein));
}
