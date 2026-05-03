"use client";

import { useMemo } from "react";
import type { TextTypography } from "@/lib/canvas-crop-text";
import { clampTypographySizeScale, fontStackFromId } from "@/lib/canvas-crop-text";

function linesFromText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
  typography,
  color,
  dragHandlers,
}: {
  text: string;
  anchorX: number;
  anchorY: number;
  typography: TextTypography;
  color: string;
  dragHandlers: PointerDragHandlers;
}) {
  const lines = useMemo(() => linesFromText(text), [text]);
  if (lines.length === 0) return null;

  const stack = fontStackFromId(typography.fontId);
  const sizeS = clampTypographySizeScale(typography.sizeScale);
  const t = color.trim();
  const safeColor =
    /^#[0-9a-f]{6}$/i.test(t) ? t : /^#[0-9a-f]{3}$/i.test(t) ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}` : "#ffffff";

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
