"use client";

import { useState } from "react";

function filenameFromContentDisposition(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const match = value.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}

export function OwnerExportAllSizesButton({ patternId }: { patternId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportAllSizes = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/patterns/${patternId}/export-all`, { method: "POST" });
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
        "StitchMint-All-Sizes.zip",
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
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void exportAllSizes()}
        className="inline-flex w-full items-center justify-center rounded-full border border-ink bg-card px-6 py-3 text-sm font-medium text-ink shadow-sm transition hover:bg-cream-deep/70 disabled:opacity-50"
      >
        {busy ? "Building all three sizes…" : "Export all sizes (ZIP)"}
      </button>
      <p className="mt-2 text-center text-xs text-muted">
        Owner export: Basic, Premium and Pro, each with regular + large print.
      </p>
      {error ? <p className="mt-2 text-sm text-red-800">{error}</p> : null}
    </div>
  );
}
