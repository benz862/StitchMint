"use client";

import { useId, useMemo } from "react";
import type { TextCurve, TextTypography } from "@/lib/canvas-crop-text";
import { clampTypographySizeScale, fontStackFromId } from "@/lib/canvas-crop-text";

function linesFromText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Quadratic path in 0–100 viewBox space; matches canvas curve logic approximately. */
function curvePathPerc(anchorX: number, anchorY: number, curve: Exclude<TextCurve, "none">): string {
  const ax = Math.min(94, Math.max(6, anchorX));
  const ay = Math.min(94, Math.max(6, anchorY));
  const half = Math.min(38, Math.max(4, ax - 3, 100 - ax - 3));
  const arc = 5;
  const p0x = ax - half;
  const p2x = ax + half;
  const p1x = ax;
  const p1y = curve === "arcUp" ? ay - arc : ay + arc;
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
}: {
  text: string;
  anchorX: number;
  anchorY: number;
  curve: TextCurve;
  typography: TextTypography;
  color: string;
  dragHandlers: PointerDragHandlers;
}) {
  const pathId = useId().replace(/:/g, "");
  const lines = useMemo(() => linesFromText(text), [text]);
  if (lines.length === 0) return null;

  const singleLine = lines.length === 1;
  const curved = singleLine && curve !== "none";
  const stack = fontStackFromId(typography.fontId);
  const sizeS = clampTypographySizeScale(typography.sizeScale);
  const t = color.trim();
  const safeColor =
    /^#[0-9a-f]{6}$/i.test(t) ? t : /^#[0-9a-f]{3}$/i.test(t) ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}` : "#ffffff";

  if (curved) {
    const d = curvePathPerc(anchorX, anchorY, curve);
    return (
      <>
        <svg
          className="pointer-events-none absolute inset-0 z-[25] h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <path id={pathId} d={d} fill="none" />
          </defs>
          <text
            dominantBaseline="middle"
            fontFamily={stack}
            fontWeight={typography.fontWeight}
            fontStyle={typography.italic ? "italic" : "normal"}
            textDecoration={typography.underline ? "underline" : "none"}
            fill={safeColor}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth={0.12 + 0.06 * Math.min(sizeS, 1.8)}
            paintOrder="stroke fill"
            fontSize={3.1 * sizeS}
          >
            <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
              {lines[0]}
            </textPath>
          </text>
        </svg>
        <div
          role="button"
          tabIndex={0}
          aria-label="Drag to move text"
          className="absolute z-[35] flex h-11 w-11 cursor-grab items-center justify-center rounded-full border-2 border-cream/90 bg-ink/80 shadow-lg touch-none select-none active:cursor-grabbing"
          style={{
            left: `${anchorX}%`,
            top: `${anchorY}%`,
            transform: "translate(-50%, -50%)",
            pointerEvents: "auto",
          }}
          {...dragHandlers}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-cream" />
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
