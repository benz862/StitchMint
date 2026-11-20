import type { Metadata } from "next";
import { StitchMintLogo } from "@/components/StitchMintLogo";
import { getPublicSpinPool, type PublicSpinPrize } from "@/lib/spin";
import { SpinWheel } from "./SpinWheel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Spin the StitchMint Wheel — win a free bookmark pattern",
  description:
    "Spin the StitchMint wheel and win a free bookmark cross stitch pattern (32 × 96 stitches). Every spin wins — just bring your email.",
};

const ETSY_SHOP_URL = "https://www.etsy.com/shop/StitchMintPatterns";

export default async function SpinPage() {
  let pool: PublicSpinPrize[] = [];
  try {
    pool = await getPublicSpinPool();
  } catch {
    pool = [];
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <div className="flex justify-center">
        <StitchMintLogo variant="hero" />
      </div>

      <h1 className="mt-6 text-center font-serif text-4xl font-bold sm:text-5xl">Spin the StitchMint Wheel</h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-lg text-muted">
        Every spin wins a free bookmark pattern — a complete 32 × 96 stitch chart with DMC thread list, delivered as
        an instant download. Pop your email in and give it a whirl.
      </p>

      <div className="mt-8">
        <SpinWheel pool={pool} />
      </div>

      <div className="mx-auto mt-12 max-w-xl text-center">
        <p className="text-sm text-muted">
          Rather just browse?{" "}
          <a href={ETSY_SHOP_URL} target="_blank" rel="noreferrer" className="font-semibold text-ink underline">
            Visit the StitchMint Etsy shop
          </a>{" "}
          for all our bookmark patterns, singles and sets of four.
        </p>
        <p className="mt-6 text-xs leading-relaxed text-muted">
          No purchase necessary. One spin per person per month. Patterns for personal use only. This promotion is not
          sponsored or endorsed by Meta, TikTok, or Pinterest.
        </p>
      </div>
    </div>
  );
}
