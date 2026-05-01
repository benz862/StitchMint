/**
 * sRGB ↔ linear, XYZ, CIELAB helpers for perceptual distance to DMC threads.
 */

export type RGB = { r: number; g: number; b: number };

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "").trim();
  const n = h.length === 6 ? h : h.padStart(6, "0");
  const v = parseInt(n, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function srgbChannelToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

export function rgbToXyz({ r, g, b }: RGB): [number, number, number] {
  const R = srgbChannelToLinear(r);
  const G = srgbChannelToLinear(g);
  const B = srgbChannelToLinear(b);
  // D65 matrix
  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const Z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
  return [X * 100, Y * 100, Z * 100];
}

export function xyzToLab([X, Y, Z]: [number, number, number]): [number, number, number] {
  const Xn = 95.047;
  const Yn = 100.0;
  const Zn = 108.883;
  const fx = pivot(X / Xn);
  const fy = pivot(Y / Yn);
  const fz = pivot(Z / Zn);
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);
  return [L, a, b];
}

function pivot(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta ** 2) + 4 / 29;
}

export function rgbToLab(rgb: RGB): [number, number, number] {
  return xyzToLab(rgbToXyz(rgb));
}

/** CIE76 Delta E in Lab space (sufficient for floss matching MVP). */
export function deltaE76(lab1: [number, number, number], lab2: [number, number, number]): number {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

export function rgbDistanceSq(a: RGB, b: RGB): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}
