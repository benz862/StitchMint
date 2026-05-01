import { Suspense } from "react";
import { LoginInner } from "./LoginInner";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="px-4 py-20 text-center text-muted">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
