"use client";

import { useMemo, useRef, useState } from "react";
import type { PublicSpinPrize } from "@/lib/spin";

const ETSY_SHOP_URL = "https://www.etsy.com/shop/StitchMintPatterns";

/** Warm, on-brand segment colors, cycled around the wheel. */
const SEGMENT_COLORS = [
  "#c96f4a",
  "#7d8c5c",
  "#d9a441",
  "#5c7d8c",
  "#a85751",
  "#8b7355",
  "#946b9e",
  "#c4a882",
];

type Phase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "spinning" }
  | { kind: "won"; prize: PublicSpinPrize; downloadUrl: string | null }
  | { kind: "already"; unlockDate: string }
  | { kind: "empty" }
  | { kind: "received" }
  | { kind: "error"; message: string };

/** Point on the wheel for an angle measured clockwise from the top. */
function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

function wedgePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const largeArc = a1 - a0 > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "next month";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function shortLabel(title: string): string {
  const clean = title.replace(/\s+bookmark$/i, "").trim() || title;
  return clean.length > 16 ? `${clean.slice(0, 15)}…` : clean;
}

export function SpinWheel({ pool }: { pool: PublicSpinPrize[] }) {
  const [email, setEmail] = useState("");
  const [optIn, setOptIn] = useState(true);
  const [honeypot, setHoneypot] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [rotation, setRotation] = useState(0);
  const [animate, setAnimate] = useState(false);
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stocked = pool.length > 0;
  const seg = stocked ? 360 / pool.length : 0;
  const busy = phase.kind === "submitting" || phase.kind === "spinning";

  const segments = useMemo(() => {
    if (!stocked) return [];
    return pool.map((prize, i) => {
      const a0 = i * seg;
      const a1 = a0 + seg;
      const mid = a0 + seg / 2;
      const [lx, ly] = polar(160, 160, 103, mid);
      return { prize, i, a0, a1, mid, lx, ly, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] };
    });
  }, [pool, seg, stocked]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setPhase({ kind: "submitting" });
    try {
      const res = await fetch("/api/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, optIn, website: honeypot }),
      });
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !data) {
        setPhase({
          kind: "error",
          message: typeof data?.error === "string" ? data.error : "Something went wrong — please try again.",
        });
        return;
      }
      if (data.status === "won") {
        const prize = data.prize as PublicSpinPrize;
        const downloadUrl = typeof data.downloadUrl === "string" ? data.downloadUrl : null;
        const idx = pool.findIndex((p) => p.id === prize.id);
        if (idx >= 0) {
          // Land the winning segment's center exactly under the top pointer.
          const center = (idx + 0.5) * seg;
          const target = (360 - center) % 360;
          const delta = ((target - rotation) % 360 + 360) % 360;
          setPhase({ kind: "spinning" });
          setAnimate(true);
          setRotation(rotation + 360 * 5 + delta);
          spinTimer.current = setTimeout(() => setPhase({ kind: "won", prize, downloadUrl }), 5600);
        } else {
          setPhase({ kind: "won", prize, downloadUrl });
        }
        return;
      }
      if (data.status === "already_spun") {
        setPhase({ kind: "already", unlockDate: String(data.unlockDate ?? "") });
        return;
      }
      if (data.status === "empty_pool") {
        setPhase({ kind: "empty" });
        return;
      }
      setPhase({ kind: "received" });
    } catch {
      setPhase({ kind: "error", message: "The wheel jammed — please try again." });
    }
  }

  return (
    <div className="w-full">
      {stocked ? (
        <div className="relative mx-auto w-full max-w-[340px]">
          {/* Pointer */}
          <div
            aria-hidden
            className="absolute left-1/2 top-[-6px] z-10 h-0 w-0 -translate-x-1/2"
            style={{
              borderLeft: "13px solid transparent",
              borderRight: "13px solid transparent",
              borderTop: "22px solid #2c2416",
            }}
          />
          <svg viewBox="0 0 320 320" className="w-full drop-shadow-xl" role="img" aria-label="Prize wheel">
            <g
              style={{
                transform: `rotate(${rotation}deg)`,
                transformBox: "fill-box",
                transformOrigin: "center",
                transition: animate ? "transform 5.4s cubic-bezier(0.12, 0.8, 0.08, 1)" : "none",
              }}
            >
              {segments.map(({ prize, i, a0, a1, mid, lx, ly, color }) => (
                <g key={prize.id}>
                  <path d={wedgePath(160, 160, 152, a0, a1)} fill={color} stroke="#f7f1e8" strokeWidth="2" />
                  <text
                    x={lx}
                    y={ly}
                    fill="#fffdf8"
                    fontSize={pool.length <= 6 ? 13 : pool.length <= 10 ? 11 : 9}
                    fontWeight="600"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${mid} ${lx} ${ly})`}
                  >
                    {shortLabel(prize.title)}
                  </text>
                  <title>{`${i + 1}. ${prize.title}`}</title>
                </g>
              ))}
              <circle cx="160" cy="160" r="152" fill="none" stroke="#2c2416" strokeWidth="3" />
            </g>
            <circle cx="160" cy="160" r="44" fill="#f7f1e8" stroke="#2c2416" strokeWidth="3" />
            <text x="160" y="154" textAnchor="middle" fontSize="15" fontWeight="700" fill="#2c2416">
              SPIN
            </text>
            <text x="160" y="172" textAnchor="middle" fontSize="10" fill="#6b5f52">
              every spin wins
            </text>
          </svg>
        </div>
      ) : null}

      {phase.kind === "won" ? (
        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
          <p className="font-serif text-2xl font-semibold">You won!</p>
          <p className="mt-1 text-lg">
            <strong>{phase.prize.title}</strong>
          </p>
          {phase.prize.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={phase.prize.previewUrl}
              alt={phase.prize.title}
              className="mx-auto mt-4 max-h-64 w-auto rounded-lg border border-line object-contain"
            />
          ) : null}
          {phase.downloadUrl ? (
            <a
              href={phase.downloadUrl}
              className="mt-5 inline-block rounded-full bg-ink px-6 py-3 font-semibold text-cream transition hover:opacity-90"
            >
              Download your free pattern
            </a>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Your pattern is on its way to your inbox — check your email for the download link.
            </p>
          )}
          <p className="mt-3 text-xs text-muted">The download link also went to your email and works for 7 days.</p>
          <div className="mt-6 border-t border-line pt-4">
            <p className="text-sm">
              Love it?{" "}
              <a href={ETSY_SHOP_URL} target="_blank" rel="noreferrer" className="font-semibold underline">
                See all our bookmark patterns on Etsy
              </a>{" "}
              — singles and sets of four, ready to stitch.
            </p>
          </div>
        </div>
      ) : phase.kind === "already" ? (
        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
          <p className="font-serif text-2xl font-semibold">You&apos;ve already spun this month</p>
          <p className="mt-2 text-muted">
            Your next spin unlocks on <strong className="text-ink">{formatDate(phase.unlockDate)}</strong>. Your
            winning pattern is in your inbox from last time.
          </p>
          <p className="mt-4 text-sm">
            Can&apos;t wait?{" "}
            <a href={ETSY_SHOP_URL} target="_blank" rel="noreferrer" className="font-semibold underline">
              Browse all our bookmark patterns on Etsy
            </a>
            .
          </p>
        </div>
      ) : phase.kind === "empty" ? (
        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
          <p className="font-serif text-2xl font-semibold">You&apos;re on the list!</p>
          <p className="mt-2 text-muted">
            The wheel is being stocked right now — we&apos;ll email you the moment it&apos;s live so you can be first
            to spin.
          </p>
        </div>
      ) : phase.kind === "received" ? (
        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
          <p className="font-serif text-2xl font-semibold">Thanks!</p>
          <p className="mt-2 text-muted">You&apos;re all set — keep an eye on your inbox.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mx-auto mt-8 max-w-md rounded-2xl border border-line bg-card p-6 shadow-sm">
          {!stocked ? (
            <p className="mb-4 text-center text-muted">
              The wheel is being stocked — join the letter and be first to spin when it goes live.
            </p>
          ) : null}
          <label htmlFor="spin-email" className="block text-sm font-semibold">
            Email address
          </label>
          <input
            id="spin-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-line bg-cream px-3 py-2.5 text-ink outline-none focus:border-accent"
          />
          {/* Honeypot — humans never see or fill this. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            className="hidden"
          />
          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={optIn}
              onChange={(e) => setOptIn(e.target.checked)}
              disabled={busy}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#8b7355]"
            />
            <span>
              Join the StitchMint letter — a free pattern in the first issue every month, plus new designs and sales.
              Unsubscribe anytime.
            </span>
          </label>
          {phase.kind === "error" ? <p className="mt-3 text-sm font-medium text-red-700">{phase.message}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full rounded-full bg-ink px-6 py-3 font-semibold text-cream transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {phase.kind === "submitting"
              ? "One moment…"
              : phase.kind === "spinning"
                ? "Spinning…"
                : stocked
                  ? "Spin the wheel"
                  : "Join the letter"}
          </button>
          {phase.kind === "spinning" ? (
            <p className="mt-3 text-center text-sm text-muted">Good luck — every spin wins!</p>
          ) : null}
        </form>
      )}

      {stocked && pool.some((p) => p.previewUrl) ? (
        <div className="mx-auto mt-10 max-w-lg">
          <p className="text-center text-sm font-semibold uppercase tracking-wide text-muted">On the wheel now</p>
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            {pool.map((prize) =>
              prize.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={prize.id}
                  src={prize.previewUrl}
                  alt={prize.title}
                  title={prize.title}
                  className="h-28 w-auto rounded-md border border-line object-cover"
                />
              ) : null,
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
