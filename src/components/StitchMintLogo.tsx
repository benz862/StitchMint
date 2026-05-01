import Image from "next/image";

type Variant = "header" | "hero" | "footer";

const variantClass: Record<Variant, string> = {
  /** Nav bar — primary brand anchor */
  header: "h-14 w-auto max-w-[min(100%,280px)] sm:h-16 sm:max-w-[320px]",
  /** Home hero — main brand moment */
  hero: "h-32 w-auto max-w-[92vw] sm:h-40 md:h-[11rem] md:max-w-2xl",
  /** Footer mark */
  footer: "h-11 w-auto max-w-[160px] sm:h-12",
};

type Props = {
  variant?: Variant;
  /** Extra Tailwind classes (e.g. drop-shadow) */
  className?: string;
  priority?: boolean;
};

/**
 * Brand mark from `/stitchmint_logo.png`. Intrinsic ratio preserved via `object-contain`.
 */
export function StitchMintLogo({ variant = "header", className = "", priority }: Props) {
  const isPriority = priority ?? (variant === "header" || variant === "hero");
  return (
    <Image
      src="/stitchmint_logo.png"
      alt="StitchMint"
      width={960}
      height={320}
      sizes={variant === "hero" ? "(max-width: 768px) 90vw, 36rem" : variant === "header" ? "260px" : "160px"}
      className={`object-contain object-center ${variantClass[variant]} ${className}`.trim()}
      priority={isPriority}
    />
  );
}
