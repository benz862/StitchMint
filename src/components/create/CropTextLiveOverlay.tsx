"use client";

import { useId, useMemo } from "react";
import type { TextCurve, TextTypography } from "@/lib/canvas-crop-text";
import { clampArcScale, clampTypographySizeScale, fontStackFromId } from "@/lib/canvas-crop-text";

function linesFromText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Quadratic path in 0–100 viewBox — full-width chord, peak X follows anchor (matches canvas). */
function curvePathPerc(anchorX: number, anchorY: number, curve: Exclude<TextCurve, "none">, arcScale: number): string {
  const margin = 3;
  const ay = Math.min(96, Math.max(4, anchorY));
  const p0x = margin;
  const p2x = 100 - margin;
  const p1x = Math.min(97 - margin, Math.max(margin + 1, anchorX));
  const arc = 7 * arcScale;
  const rawY = curve === "arcUp" ? ay - arc : ay + arc;
  const p1y = Math.min(98, Math.max(2, rawY));
  return `M ${p0x} ${ay} Q ${p1x} ${p1y} ${p2x} ${ay}`;
}

type PointerDragHandlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
};

export function CropTextLiveOverlay({
  text,
  anchorX,
  anchorY,
  curve,
  typography,
  color,
  dragHandlers,
  arcScale = 1,
}: {
  text: string;
  anchorX: number;
  anchorY: number;
  curve: TextCurve;
  typography: TextTypography;
  color: string;
  dragHandlers: PointerDragHandlers;
  /** Bend strength for curved text (matches canvas). */
  arcScale?: number;
}) {
  const pathId = useId().replace(/:/g, "");
  const lines = useMemo(() => linesFromText(text), [text]);
  if (lines.length === 0) return null;

  const singleLine = lines.length === 1;
  const curved = singleLine && curve !== "none";
  const stack = fontStackFromId(typography.fontId);
  const sizeS = clampTypographySizeScale(typography.sizeScale);
  const arcS = clampArcScale(arcScale);
  const t = color.trim();
  const safeColor =
    /^#[0-9a-f]{6}$/i.test(t) ? t : /^#[0-9a-f]{3}$/i.test(t) ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}` : "#ffffff";

  if (curved) {
    const bend: Exclude<TextCurve, "none"> = curve === "arcUp" ? "arcUp" : "arcDown";
    const d = curvePathPerc(anchorX, anchorY, bend, arcS);
    return (
      <>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          className="pointer-events-none absolute inset-0 z-[25] h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <path id={pathId} d={d} fill="none" />
          </defs>
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={safeColor}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={0.12 + 0.06 * Math.min(sizeS, 1.8)}
            paintOrder="stroke fill"
            fontSize={Math.max(2.6, 4.2 * sizeS)}
            textDecoration={typography.underline ? "underline" : "none"}
            style={{
              fontFamily: stack,
              fontWeight: typography.fontWeight,
              fontStyle: typography.italic ? "italic" : "normal",
            }}
          >
            <textPath href={`#${pathId}`} xlinkHref={`#${pathId}`} startOffset="50%">
              {lines[0]}
            </textPath>
          </text>
        </svg>
        <div
          role="button"
          tabIndex={0}
          aria-label="Drag to move curved text on the photo"
          title="Drag to position curved text. Direction: Curve up / down. Strength: Bend amount slider below."
          className="absolute z-[35] flex h-10 w-10 cursor-grab flex-col items-center justify-center gap-0.5 rounded-full border border-white/40 bg-ink/90 shadow-lg touch-none select-none active:cursor-grabbing"
          style={{
            left: `${anchorX}%`,
            top: `${anchorY}%`,
            transform: "translate(-50%, -50%)",
            pointerEvents: "auto",
          }}
          {...dragHandlers}
        >
          <span className="block h-0.5 w-4 rounded-full bg-cream" aria-hidden />
          <span className="block h-0.5 w-4 rounded-full bg-cream" aria-hidden />
          <span className="block h-0.5 w-4 rounded-full bg-cream" aria-hidden />
        </div>
      </>
    );
  }

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label="Text preview — drag to move"
      className="absolute z-[25] max-h-[70%] min-h-[2rem] min-w-[3rem] max-w-[min(92%,28rem)] cursor-grab touch-none select-none overflow-y-auto rounded-lg px-2 py-1 text-center active:cursor-grabbing"
      style={{
        left: `${anchorX}%`,
        top: `${anchorY}%`,
        transform: "translate(-50%, -50%)",
        pointerEvents: "auto",
        fontFamily: stack,
        fontWeight: typography.fontWeight,
        fontStyle: typography.italic ? "italic" : "normal",
        textDecoration: typography.underline ? "underline" : "none",
        color: safeColor,
        textShadow: "0 0 2px rgba(0,0,0,0.95), 0 1px 4px rgba(0,0,0,0.85)",
        fontSize: `clamp(${11 * sizeS}px, ${2.9 * sizeS}vmin, ${28 * sizeS}px)`,
        lineHeight: 1.28,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
      {...dragHandlers}
    >
      {lines.join("\n")}
    </div>
  );
}
