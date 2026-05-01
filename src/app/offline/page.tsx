import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-serif text-3xl text-ink">You are offline</h1>
      <p className="mt-4 text-sm text-muted">Reconnect to upload photos, build previews, or finish checkout.</p>
      <Link href="/" className="mt-8 inline-flex rounded-full bg-ink px-6 py-3 text-sm text-cream">
        Back home
      </Link>
    </div>
  );
}
