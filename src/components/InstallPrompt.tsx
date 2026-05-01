"use client";

import { useEffect, useState } from "react";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!visible || !deferred) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-line bg-card/95 p-4 shadow-lg backdrop-blur sm:left-auto">
      <p className="text-sm text-ink">Add StitchMint to your home screen for a calmer, app-like experience.</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-full bg-ink px-4 py-2 text-sm text-cream"
          onClick={async () => {
            await deferred.prompt();
            setVisible(false);
            setDeferred(null);
          }}
        >
          Install
        </button>
        <button type="button" className="rounded-full px-4 py-2 text-sm text-muted hover:bg-cream-deep/60" onClick={() => setVisible(false)}>
          Not now
        </button>
      </div>
    </div>
  );
}
