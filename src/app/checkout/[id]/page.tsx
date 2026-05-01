"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function CheckoutPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/patterns/${params.id}/checkout`, { method: "POST" });
      const json = await res.json();
      if (cancelled) return;
      if (res.ok && json.url) {
        window.location.href = json.url as string;
      } else {
        router.replace(`/preview/${params.id}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center text-muted">
      <p>Connecting to secure checkout…</p>
    </div>
  );
}
