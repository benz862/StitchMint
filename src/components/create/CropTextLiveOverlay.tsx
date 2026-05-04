"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TextTypography } from "@/lib/canvas-crop-text";
import {
  clampTypographySizeScale,
  computeOverlayFontSizePx,
  fontStackFromId,
} from "@/lib/canvas-crop-text";

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
 * Fallback when no measured frame size is available yet (very first paint). Mirrors the server's
 * starting baseline so single-line titles look roughly right before the canvas measurement runs.
 */
function fallbackFontSizePx(frameHeight: number, sizeScale: number): number {
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
  const stack = fontStackFromId(typography.fontId);
  const sizeS = clampTypographySizeScale(typography.sizeScale);
  const t = color.trim();
  const safeColor =
    /^#[0-9a-f]{6}$/i.test(t) ? t : /^#[0-9a-f]{3}$/i.test(t) ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}` : "#ffffff";
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
   * Single offscreen canvas reused across re-renders for measureText calls. Using a ref avoids
   * recreating the canvas every render and lets the same context be passed into the shared
   * computeOverlayFontSizePx helper that the server uses.
   */
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  if (measureCanvasRef.current === null && typeof document !== "undefined") {
    measureCanvasRef.current = document.createElement("canvas");
  }

  /**
   * Live-fitted px size: identical pipeline to the server's drawStraightAtAnchor, so what the
   * editor shows is what gets rasterized into composition.png. Recomputes whenever the text,
   * frame size, anchor, or typography changes.
   */
  const [fittedPx, setFittedPx] = useState<number | null>(null);
  useEffect(() => {
    if (!frameSize || frameSize.width <= 0 || frameSize.height <= 0) {
      setFittedPx(null);
      return;
    }
    if (lines.length === 0) {
      setFittedPx(null);
      return;
    }
    const canvas = measureCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) {
      setFittedPx(null);
      return;
    }
    const px = computeOverlayFontSizePx(
      ctx,
      lines,
      frameSize.width,
      frameSize.height,
      Math.min(0.999, Math.max(0.001, anchorX / 100)),
      typography,
    );
    setFittedPx(px);
  }, [lines, frameSize, anchorX, typography]);

  if (lines.length === 0) return null;

  const fontSizeStyle =
    fittedPx !== null
      ? `${fittedPx}px`
      : frameSize && frameSize.height > 0
        ? `${fallbackFontSizePx(frameSize.height, sizeS)}px`
        : `clamp(${11 * sizeS}px, ${2.9 * sizeS}vmin, ${28 * sizeS}px)`;

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label="Text preview — drag to move"
      className="absolute z-[25] cursor-grab touch-none select-none rounded-lg px-2 py-1 text-center active:cursor-grabbing"
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
        /**
         * Use `pre` (not `pre-wrap`): honor user-entered newlines but never auto-wrap on spaces.
         * The server's fitFontSize already shrinks the title to fit the crop width, and the helper
         * we share gives us the same behavior here — so a single-line title like "Glenn Donnelly"
         * stays on one line at whatever size fits, instead of breaking at the space.
         */
        whiteSpace: "pre",
      }}
      {...dragHandlers}
    >
      {lines.join("\n")}
    </div>
  );
}
