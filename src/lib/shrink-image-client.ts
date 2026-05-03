/**
 * Browser-only: shrink JPEG/PNG/WebP uploads so FormData stays under typical host limits (Vercel ~4.5MB body).
 */
export async function shrinkImageFileIfNeeded(file: File, maxBytes = 3_500_000): Promise<File> {
  /** Leave headroom under typical ~4.5MB serverless body limits (multipart is larger than raw file). */
  const shrinkIfLargerThan = 2_600_000;
  if (typeof createImageBitmap === "undefined" || file.size <= shrinkIfLargerThan) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const canvas = document.createElement("canvas");

    let w = bitmap.width;
    let h = bitmap.height;
    const maxEdge = 2400;
    const r0 = Math.min(1, maxEdge / Math.max(w, h));
    w = Math.round(w * r0);
    h = Math.round(h * r0);
    canvas.width = w;
    canvas.height = h;
    let ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const baseName = file.name.replace(/\.[^.]+$/i, "") || "image";

    for (let shrink = 0; shrink < 10; shrink++) {
      for (let q = 0.9; q >= 0.45; q -= 0.06) {
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/jpeg", q);
        });
        if (blob && blob.size <= maxBytes) {
          return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
        }
      }
      if (w < 480 && h < 480) break;
      const nw = Math.max(320, Math.round(w * 0.88));
      const nh = Math.max(320, Math.round(h * 0.88));
      const step = document.createElement("canvas");
      step.width = nw;
      step.height = nh;
      const sctx = step.getContext("2d");
      if (!sctx) break;
      sctx.drawImage(canvas, 0, 0, w, h, 0, 0, nw, nh);
      w = nw;
      h = nh;
      canvas.width = w;
      canvas.height = h;
      ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.drawImage(step, 0, 0);
    }
  } catch {
    return file;
  }

  return file;
}
