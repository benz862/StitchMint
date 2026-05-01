import { Suspense } from "react";
import { SuccessClient } from "./SuccessClient";

export const dynamic = "force-dynamic";

export default function SuccessPage() {
  return (
    <Suspense
      fallback={<div className="mx-auto max-w-md px-4 py-20 text-center text-muted">Loading…</div>}
    >
      <SuccessClient />
    </Suspense>
  );
}
