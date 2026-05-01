import Link from "next/link";
import { StitchMintLogo } from "@/components/StitchMintLogo";

export function SiteHeader() {
  return (
    <header className="border-b border-line/80 bg-card/85 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:gap-6 sm:px-6 sm:py-4">
        <Link
          href="/"
          className="group relative min-w-0 shrink rounded-xl py-0.5 outline-offset-4 transition hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink/30"
          aria-label="StitchMint — home"
        >
          <span className="block drop-shadow-[0_2px_10px_rgba(44,36,22,0.1)] transition group-hover:drop-shadow-[0_6px_20px_rgba(44,36,22,0.14)]">
            <StitchMintLogo variant="header" />
          </span>
        </Link>
        <nav className="flex shrink-0 items-center gap-2 text-sm text-muted sm:gap-4">
          <Link href="/create" className="rounded-full px-3 py-2 text-ink hover:bg-cream-deep/90 sm:px-4">
            Create
          </Link>
          <Link href="/my-patterns" className="rounded-full px-3 py-2 hover:bg-cream-deep/90 sm:px-4">
            <span className="sm:hidden">Saved</span>
            <span className="hidden sm:inline">My patterns</span>
          </Link>
          <Link href="/login" className="rounded-full bg-ink px-4 py-2 text-cream shadow-md hover:opacity-90 sm:px-5">
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
