import Link from "next/link";
import { HeroBackdrop } from "./HeroBackdrop";
import PdfPreviewCard from "./PdfPreviewCard";

/**
 * Rotating full-bleed photos (hero1–hero3). Copy lives on an opaque card so it does not fight baked-in art in the JPEGs.
 */
export default function Hero() {
  return (
    <section className="hero relative isolate min-h-[min(100svh,720px)] overflow-hidden sm:min-h-[560px]">
      <HeroBackdrop />
      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:gap-14 lg:py-20">
        <div className="hero-left mx-auto w-full max-w-xl text-center lg:mx-0 lg:text-left">
          <div className="rounded-3xl border border-line/80 bg-card/95 p-6 shadow-[0_12px_40px_rgba(44,36,22,0.08)] ring-1 ring-ink/[0.04] backdrop-blur-sm sm:p-8">
            <p className="text-xs uppercase tracking-[0.28em] text-muted">Premium cross-stitch patterns</p>
            <h1 className="mt-3 font-serif text-4xl leading-tight text-ink sm:text-5xl">From Pattern to Perfect Stitches</h1>
            <p className="mt-3 text-lg leading-relaxed text-muted">Create, view, and print beautiful cross-stitch patterns.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Link
                href="/create"
                className="inline-flex w-full items-center justify-center rounded-full bg-ink px-8 py-3.5 text-sm font-medium text-cream shadow-sm transition hover:opacity-95 sm:w-auto"
              >
                Create my pattern
              </Link>
              <Link href="/my-patterns" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
                View saved patterns
              </Link>
            </div>
          </div>
        </div>

        <div className="hero-right flex justify-center pb-4 pt-2 lg:min-w-0 lg:justify-end">
          <PdfPreviewCard />
        </div>
      </div>
    </section>
  );
}
