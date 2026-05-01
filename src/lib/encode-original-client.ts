/**
 * Client-side encode for originals uploaded directly to Supabase Storage (bypasses Vercel body limits).
 */
const MAX_EDGE_PX = 4096;

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
