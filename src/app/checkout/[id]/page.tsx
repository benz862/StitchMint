"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { demoPaymentLinkUrl } from "@/config/demo-checkout";
import { readApiJson } from "@/lib/read-api-json";

export default function CheckoutPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const demoLink = demoPaymentLinkUrl();
      if (demoLink) {
        window.location.href = demoLink;
        return;
      }

      const res = await fetch(`/api/patterns/${params.id}/checkout`, { method: "POST" });
      const json = await readApiJson<{ error?: string; url?: string }>(res);
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
