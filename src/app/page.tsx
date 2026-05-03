import Hero from "@/components/Hero";
import { PRICING_TIERS } from "@/config/pricing";

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
    q: "Why are there two chart PDFs?",
    a: "You receive the same pattern twice on purpose: one PDF packs more of the grid on each page (less paper), and the large-print PDF uses bigger symbols across more pages so it is easier to read. There is no second charge — it is included so you can pick what works best for you.",
  },
  {
    q: "What thread brand do you use?",
    a: "Charts use DMC Six-Strand Embroidery Floss numbers so you can shop confidently.",
  },
];

export default function HomePage() {
  return (
    <div>
      <Hero />

      <section className="border-y border-line/80 bg-card/70 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:grid-cols-3 sm:px-6">
          {[
            { t: "Upload", d: "Choose a clear photo you love — pets, people, places, keepsakes." },
            { t: "Refine", d: "Crop gently, pick one of three pattern tiers, choose fabric count, and preview the stitch plan." },
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
        <p className="mt-4 max-w-3xl rounded-2xl border border-line bg-cream/50 px-4 py-3 text-sm leading-relaxed text-ink">
          You get <span className="font-medium">two chart PDFs for one price</span> — the same pattern as{" "}
          <span className="font-medium">Pattern-Regular.pdf</span> (fewer pages, smaller symbols) and{" "}
          <span className="font-medium">Pattern-Large-Print.pdf</span> (more pages, easier to read). Same stitches and finished size; choose
          whichever you prefer to stitch from.
        </p>
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
            <p className="mt-3 max-w-xl text-sm text-muted">
              Three tiers — Basic, Premium, and Pro — one checkout each. The tier you pick when you create your pattern is the price you
              will see at unlock; names match your Stripe product prices (pattern_basic, pattern_premium, pattern_pro).
            </p>
          </div>
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-line bg-cream/70 p-6 shadow-sm sm:min-w-[300px]">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.id}
                className={`border-b border-line/60 pb-4 last:border-0 last:pb-0 ${tier.featured ? "rounded-xl bg-cream/80 px-3 py-2 -mx-1" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-medium text-ink">{tier.name}</p>
                  <p className="font-serif text-2xl text-ink">{tier.priceLabel}</p>
                </div>
                <p className="mt-1 text-xs text-muted">{tier.description}</p>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted">One-time download · personal use.</p>
            <p className="pt-2 text-xs leading-relaxed text-ink/90">
              Includes both chart editions (regular + large print) at no extra charge — same pattern, two printable layouts.
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
