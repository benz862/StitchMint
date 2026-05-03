import Link from "next/link";
import { StitchMintLogo } from "@/components/StitchMintLogo";

const supportEmail =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@skillbinder.com";

const copyrightYear = new Date().getFullYear();

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line/80 bg-card/60 text-center">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="flex flex-col items-center gap-6 text-sm text-muted">
          <Link href="/" className="inline-flex opacity-90 transition hover:opacity-100" aria-label="StitchMint home">
            <StitchMintLogo variant="footer" />
          </Link>
          <p className="leading-relaxed">
            Generated patterns are artistic interpretations. Colors are matched to DMC thread colors; final results vary
            with calibration, fabric, dye lots, and technique. Only upload images you own or have permission to use.
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Footer">
            <a
              href={`mailto:${supportEmail}`}
              title={supportEmail}
              className="underline-offset-4 hover:text-ink hover:underline"
            >
              Support
            </a>
            <Link href="/privacy" className="underline-offset-4 hover:text-ink hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="underline-offset-4 hover:text-ink hover:underline">
              Terms
            </Link>
          </nav>
        </div>
        <div className="mt-8 space-y-2 border-t border-line/60 pt-6 text-xs leading-relaxed text-muted">
          <p>
            © {copyrightYear} StitchMint. A SkillBinder product, operated by Epoxy Dogs LLC. All rights reserved.
          </p>
          <p>Unauthorized reproduction or distribution of any content is prohibited.</p>
        </div>
      </div>
    </footer>
  );
}
