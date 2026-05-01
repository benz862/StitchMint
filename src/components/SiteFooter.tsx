import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line/80 bg-card/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="max-w-xl leading-relaxed">
          Generated patterns are artistic interpretations. Colors are matched to DMC thread colors; final results vary
          with calibration, fabric, dye lots, and technique. Only upload images you own or have permission to use.
        </p>
        <div className="flex flex-wrap gap-4">
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
