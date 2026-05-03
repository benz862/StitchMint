import { Suspense } from "react";
import { CreateFlow } from "@/components/create/CreateFlow";

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-24 text-center text-sm text-muted">Loading…</div>}>
      <CreateFlow />
    </Suspense>
  );
}
