import Image from "next/image";
import Link from "next/link";
import PdfPreviewCard from "./PdfPreviewCard";
import { StitchMintLogo } from "./StitchMintLogo";

export default function Hero() {
  return (
    <section className="hero relative isolate min-h-[min(100svh,720px)] overflow-hidden sm:min-h-[560px]">
      <Image
        src="/hero3.jpg"
        alt="Cross-stitch and crafting"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[center_35%]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-cream/95 via-cream/90 to-cream/75 sm:bg-gradient-to-r sm:from-cream/95 sm:via-cream/82 sm:to-cream/25"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:gap-14 lg:py-20">
        <div className="hero-left max-w-xl text-center lg:mx-0 lg:text-left">
          <Link
            href="/"
            className="mx-auto mb-8 inline-flex rounded-2xl bg-card/80 px-4 py-3 shadow-sm ring-1 ring-line/60 backdrop-blur-sm transition hover:ring-accent-soft/50 lg:mx-0"
            aria-label="StitchMint home"
          >
            <StitchMintLogo variant="header" className="h-12 sm:h-14" priority />
          </Link>
          <p className="text-xs uppercase tracking-[0.28em] text-muted">Premium cross-stitch patterns</p>
          <h1 className="mt-4 font-serif text-4xl leading-tight text-ink sm:text-5xl">From Pattern to Perfect Stitches</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted">Create, view, and print beautiful cross-stitch patterns.</p>
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

        <div className="hero-right flex justify-center pb-4 pt-2 lg:min-w-0 lg:justify-end">
          <PdfPreviewCard />
        </div>
      </div>
    </section>
  );
}
