import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-line/80 bg-card/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="font-serif text-xl tracking-tight text-ink sm:text-2xl">
          StitchMint
        </Link>
        <nav className="flex items-center gap-3 text-sm text-muted sm:gap-5">
          <Link href="/create" className="rounded-full px-3 py-1.5 text-ink hover:bg-cream-deep/80">
            Create
          </Link>
          <Link href="/my-patterns" className="rounded-full px-3 py-1.5 hover:bg-cream-deep/80">
            My patterns
          </Link>
          <Link href="/login" className="rounded-full bg-ink px-4 py-2 text-cream shadow-sm hover:opacity-90">
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
