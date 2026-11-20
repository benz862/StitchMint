import Link from "next/link";
import { BatchProduce } from "./BatchProduce";

export const dynamic = "force-dynamic";

export default function AdminBatchPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm text-muted">
        <Link href="/admin" className="text-ink underline">
          ← Admin
        </Link>
      </p>
      <h1 className="mt-2 font-serif text-3xl text-ink">Batch Produce</h1>
      <p className="mt-2 text-sm text-muted">
        Many designs in, finished pattern ZIPs out — one set of choices, one click.
      </p>

      <BatchProduce />
    </div>
  );
}
