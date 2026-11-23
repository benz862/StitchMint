"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { STORAGE_BUCKETS } from "@/lib/buckets";
import { encodeImageFileToWebpBlob } from "@/lib/encode-original-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Batch Produce — drop up to 20 images (or one ZIP of images), pick the output once,
 * press Start once. Originals upload straight to Supabase Storage from the browser
 * (per file, like the create flow), the batch manifest lives server-side, and this page
 * then walks the queue item by item via /api/admin/batch/[id]/process — no per-item clicks.
 */

const MAX_ITEMS = 20;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic|heif)$/i;

type Mode = "large" | "mini" | "combo" | "bookmark" | "sized";
type CropMode = "square" | "full";
type FabricCount = 12 | 16 | 18;
type ItemStatus = "local" | "queued" | "working" | "done" | "failed";

type LocalItem = {
  id: string;
  title: string;
  file: File | null;
  status: ItemStatus;
  error: string | null;
  downloadUrl: string | null;
  outputFilename: string | null;
};

type BatchSummary = {
  id: string;
  createdAt: string;
  settings: { mode: Mode; crop: CropMode; fabricCount: FabricCount; stitchWidth?: number };
  counts: Record<"queued" | "working" | "done" | "failed", number>;
};

type ServerItem = {
  id: string;
  title: string;
  status: "queued" | "working" | "done" | "failed";
  error: string | null;
  downloadUrl: string | null;
  outputFilename: string | null;
};

/** "Sleeping_Corgi-final.PNG" / "cats/sleeping-corgi.png" → "Sleeping Corgi final" / "sleeping corgi" */
function titleFromFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const noExt = base.replace(/\.[^.]+$/, "");
  const cleaned = noExt.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "Untitled Pattern";
}

/** Append " 2", " 3", … so every title in the batch is unique (case-insensitive). */
function dedupeTitle(title: string, taken: Set<string>): string {
  let candidate = title;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${title} ${n}`;
    n += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

async function downloadFromSignedUrl(url: string, filename: string) {
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) throw new Error("bad status");
    const blob = await r.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.location.href = url;
  }
}

export function BatchProduce() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef(false);

  const [items, setItems] = useState<LocalItem[]>([]);
  const [mode, setMode] = useState<Mode>("combo");
  const [stitchWidth, setStitchWidth] = useState(64);
  const [crop, setCrop] = useState<CropMode>("square");
  const [fabricCount, setFabricCount] = useState<FabricCount>(16);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pastBatches, setPastBatches] = useState<BatchSummary[]>([]);

  const started = batchId !== null;
  const doneCount = items.filter((i) => i.status === "done").length;
  const settledCount = items.filter((i) => i.status === "done" || i.status === "failed").length;
  const resumable = started && !running && items.some((i) => i.status === "queued" || i.status === "working");

  const loadPastBatches = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/batch");
      if (!res.ok) return;
      const j = (await res.json()) as { batches?: BatchSummary[] };
      setPastBatches(j.batches ?? []);
    } catch {
      /* resume list is a convenience — ignore failures */
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadPastBatches();
    });
  }, [loadPastBatches]);

  const patchItem = useCallback((id: string, patch: Partial<LocalItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      setMessage(null);
      const incoming = Array.from(files);
      const expanded: File[] = [];
      for (const f of incoming) {
        if (/\.zip$/i.test(f.name) || f.type === "application/zip" || f.type === "application/x-zip-compressed") {
          try {
            const zip = await JSZip.loadAsync(f);
            const entries = Object.values(zip.files)
              .filter((e) => !e.dir && IMAGE_EXT_RE.test(e.name) && !e.name.split("/").pop()?.startsWith("."))
              .sort((a, b) => a.name.localeCompare(b.name));
            for (const entry of entries) {
              const blob = await entry.async("blob");
              const base = entry.name.split("/").pop() ?? entry.name;
              expanded.push(new File([blob], base, { type: blob.type || "image/png" }));
            }
          } catch {
            setError(`Could not open "${f.name}" as a ZIP file.`);
          }
        } else if (f.type.startsWith("image/") || IMAGE_EXT_RE.test(f.name)) {
          expanded.push(f);
        }
      }
      if (!expanded.length) return;
      setItems((prev) => {
        const taken = new Set(prev.map((i) => i.title.toLowerCase()));
        const next = [...prev];
        for (const f of expanded) {
          if (next.length >= MAX_ITEMS) {
            setError(`A batch holds at most ${MAX_ITEMS} images — extra files were not added.`);
            break;
          }
          next.push({
            id: crypto.randomUUID(),
            title: dedupeTitle(titleFromFilename(f.name), taken),
            file: f,
            status: "local",
            error: null,
            downloadUrl: null,
            outputFilename: null,
          });
        }
        return next;
      });
    },
    [],
  );

  /** POST one item to the process route and fold the result back into local state. */
  const processOne = useCallback(
    async (forBatchId: string, itemId: string): Promise<void> => {
      patchItem(itemId, { status: "working", error: null });
      try {
        const res = await fetch(`/api/admin/batch/${forBatchId}/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const j = (await res.json().catch(() => ({}))) as { item?: ServerItem; error?: string };
        if (!res.ok || !j.item) throw new Error(j.error ?? `Request failed (${res.status})`);
        patchItem(itemId, {
          status: j.item.status,
          error: j.item.error,
          downloadUrl: j.item.downloadUrl,
          outputFilename: j.item.outputFilename,
        });
      } catch (err) {
        patchItem(itemId, {
          status: "failed",
          error: err instanceof Error ? err.message : "Processing failed",
        });
      }
    },
    [patchItem],
  );

  /** Walk every queued/working item in order — the no-clicks queue driver. */
  const runQueue = useCallback(
    async (forBatchId: string, snapshot: LocalItem[]) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setRunning(true);
      try {
        for (const item of snapshot) {
          if (item.status !== "queued" && item.status !== "working") continue;
          await processOne(forBatchId, item.id);
        }
      } finally {
        runningRef.current = false;
        setRunning(false);
        void loadPastBatches();
      }
    },
    [processOne, loadPastBatches],
  );

  const startBatch = useCallback(async () => {
    setError(null);
    setMessage(null);
    if (!items.length) {
      setError("Add at least one image first.");
      return;
    }
    if (items.some((i) => !i.title.trim())) {
      setError("Every design needs a title.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You need to be signed in.");

      const newBatchId = crypto.randomUUID();
      const payloadItems: Array<{ id: string; title: string; originalPath: string }> = [];
      for (const item of items) {
        if (!item.file) throw new Error(`"${item.title}" is missing its image file — re-add it.`);
        const blob = await encodeImageFileToWebpBlob(item.file);
        const contentType = blob.type === "image/webp" ? "image/webp" : "image/jpeg";
        const ext = contentType === "image/webp" ? "webp" : "jpg";
        const path = `${user.id}/__batch__/${newBatchId}/${item.id}/original.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKETS.originals)
          .upload(path, blob, { contentType, upsert: true });
        if (upErr) throw new Error(upErr.message ?? `Upload failed for "${item.title}"`);
        payloadItems.push({ id: item.id, title: item.title.trim(), originalPath: path });
      }

      const res = await fetch("/api/admin/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newBatchId,
          settings: { mode, crop, fabricCount, ...(mode === "sized" ? { stitchWidth } : {}) },
          items: payloadItems,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `Could not create the batch (${res.status})`);

      const queued = items.map((i) => ({ ...i, status: "queued" as ItemStatus }));
      setItems(queued);
      setBatchId(newBatchId);
      setMessage("Batch created — producing your patterns now. You can leave this page open and watch, or come back later and resume.");
      void runQueue(newBatchId, queued);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the batch");
    } finally {
      setBusy(false);
    }
  }, [items, mode, stitchWidth, crop, fabricCount, runQueue]);

  const openBatch = useCallback(
    async (id: string) => {
      setError(null);
      setMessage(null);
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/batch/${id}`);
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          batch?: {
            settings: { mode: Mode; crop: CropMode; fabricCount: FabricCount; stitchWidth?: number };
            items: ServerItem[];
          };
        };
        if (!res.ok || !j.batch) throw new Error(j.error ?? `Could not open that batch (${res.status})`);
        setMode(j.batch.settings.mode);
        setStitchWidth(j.batch.settings.stitchWidth ?? 64);
        setCrop(j.batch.settings.crop);
        setFabricCount(j.batch.settings.fabricCount);
        setItems(
          j.batch.items.map((i) => ({
            id: i.id,
            title: i.title,
            file: null,
            status: i.status,
            error: i.error,
            downloadUrl: i.downloadUrl,
            outputFilename: i.outputFilename,
          })),
        );
        setBatchId(id);
        setMessage("Batch reopened. Finished designs are ready to download; anything still queued can be resumed.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not open that batch");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const downloadAll = useCallback(async () => {
    if (!batchId) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/batch/${batchId}/download-all`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { url?: string; filename?: string; error?: string };
      if (!res.ok || !j.url) throw new Error(j.error ?? `Download-all failed (${res.status})`);
      await downloadFromSignedUrl(j.url, j.filename ?? "StitchMint-Batch.zip");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download-all failed");
    } finally {
      setBusy(false);
    }
  }, [batchId]);

  const resetAll = useCallback(() => {
    setItems([]);
    setBatchId(null);
    setError(null);
    setMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    void loadPastBatches();
  }, [loadPastBatches]);

  return (
    <section className="mt-10 rounded-3xl border border-line bg-card/90 p-6 shadow-sm">
      <h2 className="font-serif text-2xl text-ink">Batch Produce</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Drop up to {MAX_ITEMS} images — or one ZIP full of images — pick Large, Mini, Combo, Bookmark, or an exact
        stitch width with Mini once, and press Start once. Each design is named from its file name, produced on its own, and saved as its own ZIP. No
        clicking through designs one at a time.
      </p>

      {!started ? (
        <>
          <div
            className={`mt-6 rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
              dragOver ? "border-ink bg-cream/70" : "border-line bg-cream/40"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void addFiles(e.dataTransfer.files);
            }}
          >
            <p className="text-sm text-ink">Drag &amp; drop images or a ZIP here</p>
            <p className="mt-1 text-xs text-muted">…or</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.zip,application/zip"
              multiple
              className="mx-auto mt-2 block max-w-md text-sm text-ink file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-medium file:text-cream"
              disabled={busy}
              onChange={(e) => {
                if (e.target.files?.length) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Output</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["large", "Large (All Sizes)"],
                    ["mini", "Mini only"],
                    ["combo", "Combo (Large + Mini)"],
                    ["bookmark", "Bookmark"],
                    ["sized", "Exact width + Mini"],
                  ] as Array<[Mode, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={`rounded-full px-4 py-2 text-sm ${
                      mode === value ? "bg-ink text-cream" : "bg-cream-deep/80 text-ink hover:bg-cream-deep"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {mode === "sized" ? (
                <label className="mt-3 flex items-center gap-2 text-sm text-ink">
                  Stitch width
                  <input
                    type="number"
                    min={24}
                    max={160}
                    step={1}
                    value={stitchWidth}
                    onChange={(e) => setStitchWidth(Number(e.target.value))}
                    className="w-20 rounded-xl border border-line bg-card px-3 py-1.5 text-sm text-ink"
                  />
                  <span className="text-xs text-muted">exact, plus the Mini in every ZIP</span>
                </label>
              ) : null}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Crop</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["square", "Square (center)"],
                    ["full", "Full image"],
                  ] as Array<[CropMode, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={mode === "bookmark"}
                    onClick={() => setCrop(value)}
                    className={`rounded-full px-4 py-2 text-sm ${
                      crop === value ? "bg-ink text-cream" : "bg-cream-deep/80 text-ink hover:bg-cream-deep"
                    } ${mode === "bookmark" ? "cursor-not-allowed opacity-50 hover:bg-cream-deep/80" : ""}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {mode === "bookmark" ? (
                <p className="mt-2 text-xs text-muted">
                  Bookmarks always use a centered 1:3 frame — the crop choice doesn&apos;t apply.
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Fabric count</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {([12, 16, 18] as FabricCount[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFabricCount(value)}
                    className={`rounded-full px-4 py-2 text-sm ${
                      fabricCount === value ? "bg-ink text-cream" : "bg-cream-deep/80 text-ink hover:bg-cream-deep"
                    }`}
                  >
                    {value}-count
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Producing:{" "}
          <strong className="text-ink">
            {mode === "large"
              ? "Large (All Sizes)"
              : mode === "mini"
                ? "Mini only"
                : mode === "bookmark"
                  ? "Bookmark"
                  : mode === "sized"
                    ? `Exact width ${stitchWidth} + Mini`
                    : "Combo (Large + Mini)"}
          </strong>{" "}
          · {mode === "bookmark" ? "1:3 frame" : crop === "square" ? "Square crop" : "Full image"} · {fabricCount}
          -count Aida
        </p>
      )}

      {items.length ? (
        <div className="mt-6">
          {started ? (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  {doneCount} of {items.length} designs done
                  {items.some((i) => i.status === "failed") ? ` · ${items.filter((i) => i.status === "failed").length} failed` : ""}
                </span>
                <span>{items.length ? Math.round((settledCount / items.length) * 100) : 0}%</span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-cream-deep/70">
                <div
                  className="h-full rounded-full bg-ink transition-all"
                  style={{ width: `${items.length ? (settledCount / items.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          ) : null}

          <ul className="divide-y divide-line/80 rounded-2xl border border-line bg-card">
            {items.map((item, idx) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-6 text-xs text-muted">{idx + 1}.</span>
                {started ? (
                  <span className="min-w-40 flex-1 text-sm font-medium text-ink">{item.title}</span>
                ) : (
                  <input
                    value={item.title}
                    onChange={(e) => patchItem(item.id, { title: e.target.value })}
                    maxLength={80}
                    className="min-w-40 flex-1 rounded-xl border border-line bg-card px-3 py-1.5 text-sm text-ink"
                    aria-label={`Title for design ${idx + 1}`}
                  />
                )}
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    item.status === "done"
                      ? "bg-emerald-100 text-emerald-900"
                      : item.status === "failed"
                        ? "bg-red-100 text-red-900"
                        : item.status === "working"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-cream-deep/80 text-ink"
                  }`}
                >
                  {item.status === "local"
                    ? "Ready"
                    : item.status === "queued"
                      ? "Queued"
                      : item.status === "working"
                        ? "Producing…"
                        : item.status === "done"
                          ? "Done"
                          : "Failed"}
                </span>
                {!started ? (
                  <button
                    type="button"
                    className="text-xs text-ink underline"
                    onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                  >
                    Remove
                  </button>
                ) : null}
                {item.status === "failed" && batchId ? (
                  <button
                    type="button"
                    className="rounded-full border border-line bg-card px-3 py-1 text-xs font-medium text-ink hover:bg-cream-deep/80"
                    disabled={running}
                    onClick={() => void processOne(batchId, item.id)}
                  >
                    Retry
                  </button>
                ) : null}
                {item.status === "done" && item.downloadUrl ? (
                  <button
                    type="button"
                    className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-cream"
                    onClick={() => void downloadFromSignedUrl(item.downloadUrl as string, item.outputFilename ?? `${item.title}.zip`)}
                  >
                    Download ZIP
                  </button>
                ) : null}
                {item.error ? <span className="w-full text-xs text-red-800">{item.error}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        {!started ? (
          <button
            type="button"
            disabled={busy || !items.length}
            onClick={() => void startBatch()}
            className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-cream shadow disabled:opacity-50"
          >
            {busy ? "Uploading…" : `Start batch (${items.length} design${items.length === 1 ? "" : "s"})`}
          </button>
        ) : (
          <>
            {resumable ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => batchId && void runQueue(batchId, items)}
                className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-cream shadow disabled:opacity-50"
              >
                Resume processing
              </button>
            ) : null}
            {doneCount > 0 ? (
              <button
                type="button"
                disabled={busy || running}
                onClick={() => void downloadAll()}
                className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-cream shadow disabled:opacity-50"
              >
                {busy ? "Preparing…" : `Download all (${doneCount} ZIP${doneCount === 1 ? "" : "s"})`}
              </button>
            ) : null}
            <button
              type="button"
              disabled={running}
              onClick={resetAll}
              className="rounded-full border border-line bg-card px-6 py-2.5 text-sm font-medium text-ink shadow-sm disabled:opacity-50"
            >
              New batch
            </button>
          </>
        )}
      </div>

      {!started && pastBatches.length ? (
        <div className="mt-8 border-t border-line pt-6">
          <h3 className="text-sm font-medium text-ink">Earlier batches</h3>
          <ul className="mt-3 space-y-2">
            {pastBatches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 text-sm text-muted">
                <span className="text-ink">{new Date(b.createdAt).toLocaleString()}</span>
                <span>
                  {b.settings.mode === "large"
                    ? "Large"
                    : b.settings.mode === "mini"
                      ? "Mini"
                      : b.settings.mode === "bookmark"
                        ? "Bookmark"
                        : b.settings.mode === "sized"
                          ? `Exact width ${b.settings.stitchWidth ?? "?"} + Mini`
                          : "Combo"}{" "}
                  ·{" "}
                  {b.counts.done} done
                  {b.counts.failed ? ` · ${b.counts.failed} failed` : ""}
                  {b.counts.queued || b.counts.working ? ` · ${b.counts.queued + b.counts.working} waiting` : ""}
                </span>
                <button
                  type="button"
                  className="text-ink underline"
                  disabled={busy}
                  onClick={() => void openBatch(b.id)}
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-800">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-ink">{message}</p> : null}
    </section>
  );
}
