import Link from "next/link";

const faqs = [
  {
    q: "Will it look exactly like my photo?",
    a: "Cross-stitch is made of tiny squares of thread, so it is always an interpretation. StitchMint keeps the feeling of your photo while staying stitchable.",
  },
  {
    q: "Do I need special software?",
    a: "No. Everything happens in your browser. After purchase you download a simple ZIP with PDFs and a preview image.",
  },
  {
    q: "What thread brand do you use?",
    a: "Charts use DMC Six-Strand Embroidery Floss numbers so you can shop confidently.",
  },
];

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-muted">Premium cross-stitch patterns</p>
          <h1 className="mt-4 font-serif text-4xl leading-tight text-ink sm:text-5xl">
            Turn any photo into a beautiful cross-stitch pattern
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Upload a favorite photo and receive a printable cross-stitch chart with DMC thread colors, symbols, fabric size, and a
            shopping list.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
      </section>

      <section className="border-y border-line/80 bg-card/70 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:grid-cols-3 sm:px-6">
          {[
            { t: "Upload", d: "Choose a clear photo you love — pets, people, places, keepsakes." },
            { t: "Refine", d: "Crop gently, pick a size and fabric count, and preview the stitch plan." },
            { t: "Stitch", d: "Unlock the full chart, print at home, and enjoy calm stitching time." },
          ].map((s) => (
            <div key={s.t} className="rounded-3xl border border-line bg-cream/60 p-6 shadow-sm">
              <p className="font-serif text-xl text-ink">{s.t}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="font-serif text-3xl text-ink">Perfect for</h2>
        <p className="mt-4 max-w-3xl text-muted">
          Pets, family photos, memorial gifts, wedding photos, baby photos, homes, and keepsakes — anything that deserves a slower,
          handmade moment.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="font-serif text-3xl text-ink">What you receive</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            "Regular print chart PDF (easy to tile on a home printer)",
            "Large print chart PDF (bigger symbols for tired eyes)",
            "Thread shopping list PDF with checkboxes",
            "Color preview image for your records",
            "A gentle “read me first” guide for printing and starting",
          ].map((item) => (
            <li key={item} className="rounded-2xl border border-line bg-card/80 px-4 py-4 text-sm text-muted">
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y border-line/80 bg-card/70 py-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <h2 className="font-serif text-3xl text-ink">Pricing</h2>
            <p className="mt-3 max-w-xl text-sm text-muted">Simple today. Room for lovely extras later.</p>
          </div>
          <div className="rounded-3xl border border-line bg-cream/70 p-6 shadow-sm sm:min-w-[280px]">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Single pattern</p>
            <p className="mt-2 font-serif text-4xl text-ink">
              ${process.env.NEXT_PUBLIC_PATTERN_PRICE_LABEL ?? "9.95"}
            </p>
            <p className="mt-2 text-sm text-muted">One-time download · personal use</p>
            <p className="mt-4 text-xs text-muted">
              Coming soon: premium large charts, cleanup bundles, commercial licenses, and printed mailing.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="font-serif text-3xl text-ink">Questions</h2>
        <div className="mt-8 space-y-6">
          {faqs.map((f) => (
            <div key={f.q} className="rounded-2xl border border-line bg-card/80 p-5">
              <p className="font-medium text-ink">{f.q}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
