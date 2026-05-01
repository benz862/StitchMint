"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

export const HERO_BACKDROP_IMAGES = ["/hero1.jpg", "/hero2.jpg", "/hero3.jpg"] as const;

const ROTATE_MS = 7000;

type Props = {
  /** Defaults to hero1 / hero2 / hero3 in /public */
  images?: readonly string[];
};

export function HeroBackdrop({ images = HERO_BACKDROP_IMAGES }: Props) {
  const list = images.length ? images : HERO_BACKDROP_IMAGES;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % list.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [list.length]);

  const go = useCallback((i: number) => setIndex(i % list.length), [list.length]);

  return (
    <>
      <div className="absolute inset-0 z-0">
        {list.map((src, i) => (
          <Image
            key={src}
            src={src}
            alt=""
            fill
            sizes="100vw"
            className={
              i === index
                ? "z-[1] object-cover object-[center_35%] opacity-100 transition-opacity duration-1000 ease-in-out"
                : "z-0 object-cover object-[center_35%] opacity-0 transition-opacity duration-1000 ease-in-out"
            }
            priority={i === 0}
            fetchPriority={i === 0 ? "high" : "low"}
          />
        ))}
      </div>
      <div
        aria-hidden
        className="absolute inset-0 z-[1] bg-gradient-to-b from-cream/80 via-cream/55 to-cream/40 sm:bg-gradient-to-r sm:from-cream/85 sm:via-cream/50 sm:to-transparent"
      />
      <div className="absolute inset-x-0 bottom-6 z-[2] flex justify-center gap-2 sm:bottom-8">
        {list.map((_, i) => (
          <button
            key={String(i)}
            type="button"
            onClick={() => go(i)}
            className={`h-2 rounded-full transition-all ${
              i === index ? "w-8 bg-ink/70" : "w-2 bg-ink/35 hover:bg-ink/50"
            }`}
            aria-label={`Show hero image ${i + 1} of ${list.length}`}
          />
        ))}
      </div>
    </>
  );
}
