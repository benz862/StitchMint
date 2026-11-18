"use client";

import { useState } from "react";

function filenameFromContentDisposition(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const match = value.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}

export function OwnerExportAllSizesButton({ patternId }: { patternId: string }) {
  const [busy, setBusy] = useState<"all" | "mini" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const downloadZip = async (kind: "all" | "mini") => {
    setBusy(kind);
    setError(null);
    try {
      const endpoint = kind === "all" ? "export-all" : "export-mini";
      const res = await fetch(`/api/patterns/${patternId}/${endpoint}`, { method: "POST" });
      if (!res.ok) {
        let message = "Export failed";
        try {
          const json = (await res.json()) as { error?: string };
          if (json.error) message = json.error;
        } catch {
          // Keep the generic message when the response is not JSON.
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const filename = filenameFromContentDisposition(
        res.headers.get("content-disposition"),
        kind === "all" ? "StitchMint-All-Sizes.zip" : "StitchMint-Mini.zip",
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const buttonClass =
    "inline-flex w-full items-center justify-center rounded-full border border-ink bg-card px-6 py-3 text-sm font-medium text-ink shadow-sm transition hover:bg-cream-deep/70 disabled:opacity-50";

  return (
    <div>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void downloadZip("all")}
        className={buttonClass}
      >
        {busy === "all" ? "Building all three sizes…" : "Export all sizes (ZIP)"}
      </button>
      <p className="mt-2 text-center text-xs text-muted">
        Owner export: Basic, Premium and Pro, each with regular + large print.
      </p>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void downloadZip("mini")}
        className={`${buttonClass} mt-3`}
      >
        {busy === "mini" ? "Building Mini…" : "Export Mini only (ZIP)"}
      </button>
      <p className="mt-2 text-center text-xs text-muted">
        Owner export: Mini size only — 64 stitches wide (4 in on 16-count), regular + large print.
      </p>
      {error ? <p className="mt-2 text-sm text-red-800">{error}</p> : null}
    </div>
  );
}
