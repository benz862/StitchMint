"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminDemoTierSamples } from "./AdminDemoTierSamples";

type Pattern = Record<string, unknown>;
type Order = Record<string, unknown>;

export function AdminDashboard() {
  const [q, setQ] = useState("");
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [revenueCents, setRevenueCents] = useState(0);
  const [failed, setFailed] = useState<Pattern[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    const res = await fetch(`/api/admin?q=${encodeURIComponent(q)}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Could not load admin data");
      return;
    }
    setPatterns(json.patterns ?? []);
    setOrders(json.orders ?? []);
    setRevenueCents(json.revenueCents ?? 0);
    setFailed(json.failedGenerations ?? []);
  };

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const revenue = useMemo(() => (revenueCents / 100).toFixed(2), [revenueCents]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-serif text-3xl text-ink">Admin</h1>
      <p className="mt-2 text-sm text-muted">Patterns, orders, and light operations.</p>

      <AdminDemoTierSamples />

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-xs uppercase tracking-wide text-muted">Search by customer email</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-line bg-card px-4 py-2 text-sm"
            placeholder="name@email.com"
          />
        </div>
        <button type="button" className="rounded-full bg-ink px-5 py-2 text-sm text-cream" onClick={() => void load()}>
          Search
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-800">{error}</p> : null}

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-line bg-card/90 p-5 shadow-sm">
          <p className="text-xs text-muted">Revenue (completed orders)</p>
          <p className="mt-2 font-serif text-3xl text-ink">${revenue}</p>
        </div>
        <div className="rounded-3xl border border-line bg-card/90 p-5 shadow-sm">
          <p className="text-xs text-muted">Patterns loaded</p>
          <p className="mt-2 font-serif text-3xl text-ink">{patterns.length}</p>
        </div>
        <div className="rounded-3xl border border-line bg-card/90 p-5 shadow-sm">
          <p className="text-xs text-muted">Failed generations</p>
          <p className="mt-2 font-serif text-3xl text-ink">{failed.length}</p>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="font-serif text-2xl text-ink">Patterns</h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card/90">
          <table className="min-w-full text-left text-xs text-muted">
            <thead className="bg-cream/80 text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">ZIP</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {patterns.map((p) => (
                <tr key={String(p.id)} className="border-t border-line/80">
                  <td className="px-3 py-2 font-mono text-[11px] text-ink">{String(p.id).slice(0, 8)}…</td>
                  <td className="px-3 py-2 text-ink">{String(p.title ?? "")}</td>
                  <td className="px-3 py-2">{String(p.payment_status ?? "")}</td>
                  <td className="px-3 py-2">{p.zip_file_url ? "yes" : "—"}</td>
                  <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      className="text-ink underline"
                      onClick={async () => {
                        if (!confirm("Delete this pattern and files?")) return;
                        await fetch(`/api/admin/patterns/${String(p.id)}`, { method: "DELETE" });
                        await load();
                      }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="text-ink underline"
                      onClick={async () => {
                        await fetch(`/api/admin/patterns/${String(p.id)}/regenerate`, { method: "POST" });
                        await load();
                      }}
                    >
                      Regenerate ZIP
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-2xl text-ink">Orders</h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card/90">
          <table className="min-w-full text-left text-xs text-muted">
            <thead className="bg-cream/80 text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Pattern</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={String(o.id)} className="border-t border-line/80">
                  <td className="px-3 py-2">{String(o.created_at ?? "")}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-ink">{String(o.pattern_id ?? "").slice(0, 8)}…</td>
                  <td className="px-3 py-2 text-ink">{((Number(o.amount ?? 0) || 0) / 100).toFixed(2)}</td>
                  <td className="px-3 py-2">{String(o.status ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
