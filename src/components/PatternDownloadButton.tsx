"use client";

import { useState } from "react";

export function PatternDownloadButton({ patternId }: { patternId: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        className="rounded-full bg-ink px-4 py-2 text-sm text-cream"
        onClick={async () => {
          setError(null);
          const res = await fetch(`/api/patterns/${patternId}/download`);
          const json = await res.json();
          if (!res.ok) {
            setError(json.error ?? "Download failed");
            return;
          }
          if (json.url) window.location.href = json.url as string;
        }}
      >
        Download
      </button>
      {error ? <p className="mt-2 text-xs text-red-800">{error}</p> : null}
    </div>
  );
}
