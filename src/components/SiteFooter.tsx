import Link from "next/link";
import { StitchMintLogo } from "@/components/StitchMintLogo";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line/80 bg-card/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-muted sm:flex-row sm:items-start sm:justify-between sm:gap-8 sm:px-6">
        <div className="flex min-w-0 flex-col gap-4 sm:max-w-xl">
          <Link href="/" className="inline-flex w-fit shrink-0 opacity-90 transition hover:opacity-100" aria-label="StitchMint home">
            <StitchMintLogo variant="footer" />
          </Link>
          <p className="leading-relaxed">
            Generated patterns are artistic interpretations. Colors are matched to DMC thread colors; final results vary
            with calibration, fabric, dye lots, and technique. Only upload images you own or have permission to use.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-4 sm:flex-col sm:items-end">
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="underline-offset-4 hover:underline">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
