/**
 * Client-side encode for originals uploaded directly to Supabase Storage (bypasses Vercel body limits).
 */
export const MAX_ORIGINAL_EDGE_PX = 4096;
const MAX_EDGE_PX = MAX_ORIGINAL_EDGE_PX;

export async function encodeImageFileToWebpBlob(file: File, quality = 0.88): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const maxDim = Math.max(bitmap.width, bitmap.height);
    const scale = maxDim > MAX_EDGE_PX ? MAX_EDGE_PX / maxDim : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.drawImage(bitmap, 0, 0, w, h);

    let blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/webp", quality);
    });
    if (blob && blob.size > 0) return blob;

    for (let q = quality; q >= 0.55; q -= 0.07) {
      blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/webp", q);
      });
      if (blob && blob.size > 0) return blob;
    }

    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
    });
    if (blob && blob.size > 0) return blob;
    throw new Error("Could not encode image in this browser");
  } finally {
    bitmap.close();
  }
}

/** Encode a canvas (e.g. cropped + text) to WebP, downscaling long edges like `encodeImageFileToWebpBlob`. */
export async function encodeCanvasToWebpBlob(canvas: HTMLCanvasElement, quality = 0.88): Promise<Blob> {
  const maxDim = Math.max(canvas.width, canvas.height);
  const scale = maxDim > MAX_EDGE_PX ? MAX_EDGE_PX / maxDim : 1;
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(canvas, 0, 0, w, h);

  let blob = await new Promise<Blob | null>((resolve) => {
    out.toBlob((b) => resolve(b), "image/webp", quality);
  });
  if (blob && blob.size > 0) return blob;

  for (let q = quality; q >= 0.55; q -= 0.07) {
    blob = await new Promise<Blob | null>((resolve) => {
      out.toBlob((b) => resolve(b), "image/webp", q);
    });
    if (blob && blob.size > 0) return blob;
  }

  blob = await new Promise<Blob | null>((resolve) => {
    out.toBlob((b) => resolve(b), "image/jpeg", 0.85);
  });
  if (blob && blob.size > 0) return blob;
  throw new Error("Could not encode image in this browser");
}

/** Pixel size after the same downscale applied before upload (matches encoded file). */
export function getEncodedOutputSize(width: number, height: number): { width: number; height: number } {
  const maxDim = Math.max(width, height);
  const scale = maxDim > MAX_EDGE_PX ? MAX_EDGE_PX / maxDim : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
