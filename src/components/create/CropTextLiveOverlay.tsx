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

/**
 * Mirrors the server's font sizing in `canvas-crop-text.ts` (fitFontSize + scaledFontSize).
 *  - Server: baseFit ≈ max(16, maxBand * 0.22) where maxBand = cropBuffer.height * 0.75
 *           → baseFit ≈ cropBuffer.height * 0.165
 *           Then scaled by the user's sizeScale.
 *  - Client: same formula but using the live crop frame's pixel height. Doing this means the live
 *    overlay shows text at the same proportional size the server will rasterize, so dragging in
 *    the editor produces a true WYSIWYG anchor — no more "looks centered on the helmet in editor
 *    but lands on the forehead in the preview".
 *
 * If you change `0.75` here, change `maxBand = ch * 0.75` in canvas-crop-text.ts in lockstep,
 * and bump the wrapper div's `max-h-[…]` class so the CSS clamp doesn't truncate big titles.
 */
function proportionalFontSizePx(frameHeight: number, sizeScale: number): number {
  const maxBand = frameHeight * 0.75;
  const baseFit = Math.max(16, Math.round(maxBand * 0.22));
  return Math.max(8, Math.round(baseFit * sizeScale));
}

export function CropTextLiveOverlay({
  text,
  anchorX,
  anchorY,
  typography,
  color,
  dragHandlers,
  frameSize,
}: {
  text: string;
  anchorX: number;
  anchorY: number;
  typography: TextTypography;
  color: string;
  dragHandlers: PointerDragHandlers;
  /** Live pixel size of the crop frame; when present, font scales to match server output. */
  frameSize?: { width: number; height: number } | null;
}) {
  const lines = useMemo(() => linesFromText(text), [text]);
  if (lines.length === 0) return null;

  const stack = fontStackFromId(typography.fontId);
  const sizeS = clampTypographySizeScale(typography.sizeScale);
  const t = color.trim();
  const safeColor =
    /^#[0-9a-f]{6}$/i.test(t) ? t : /^#[0-9a-f]{3}$/i.test(t) ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}` : "#ffffff";
  /** Outline only when the user opts in; matches the server-side rasterizer. */
  const wantsOutline = typography.outline;
  const isLight = (() => {
    const m = safeColor.replace("#", "");
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    if (![r, g, b].every((v) => Number.isFinite(v))) return true;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
  })();
  const outlineColor = isLight ? "#000000" : "#ffffff";

  /**
   * Prefer a frame-proportional font size (matches the server). Fall back to the legacy
   * viewport-based clamp if the frame size hasn't been measured yet (very first paint).
   */
  const fontSizeStyle =
    frameSize && frameSize.height > 0
      ? `${proportionalFontSizePx(frameSize.height, sizeS)}px`
      : `clamp(${11 * sizeS}px, ${2.9 * sizeS}vmin, ${28 * sizeS}px)`;

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label="Text preview — drag to move"
      className="absolute z-[25] max-h-[88%] min-h-[2rem] min-w-[3rem] max-w-[min(98%,32rem)] cursor-grab touch-none select-none rounded-lg px-2 py-1 text-center active:cursor-grabbing"
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
        WebkitTextStroke: wantsOutline ? `1px ${outlineColor}` : undefined,
        fontSize: fontSizeStyle,
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
