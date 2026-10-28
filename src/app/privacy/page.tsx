export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="font-serif text-3xl text-ink">Privacy policy</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
        <p>
          StitchMint processes the images you upload solely to generate cross-stitch pattern previews and purchased
          downloads. We use trusted infrastructure providers (including Supabase for authentication and storage, and
          Stripe for payments) under their respective terms.
        </p>
        <p>
          We do not sell your personal information. You may request deletion of your account data by contacting support
          at the email shown in your Read-Me-First guide after purchase.
        </p>
        <p>
          Analytics may be added in the future in a privacy-preserving way; this MVP focuses on core pattern generation
          and checkout.
        </p>
      </div>
    </div>
  );
}
