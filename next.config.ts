import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "pdfkit", "@napi-rs/canvas"],
  /**
   * Force Next.js's serverless function tracer to include the bundled @fontsource WOFF files for
   * EVERY route under /api/** that might rasterize text via @napi-rs/canvas. The static tracer
   * cannot follow path.join(process.cwd(), "node_modules/@fontsource/...") so without this glob
   * the WOFFs are absent at runtime, server-fonts.ts logs "font file missing at runtime" warnings,
   * and @napi-rs/canvas falls back to system fonts that don't exist on Vercel's Linux runtime —
   * the canvas still draws but every glyph is invisible. Symptom: text shows in local dev but
   * disappears in production previews / generated PDFs / tier samples.
   *
   * Routes that need this include /api/patterns/** (customer flow) AND /api/admin/** (admin tier
   * sample builder + webapp showcase). Keep this scoped to /api/** rather than the project root
   * to avoid bloating non-API server bundles with unused font assets.
   */
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/@fontsource/inter/files/inter-latin-*-normal.woff",
      "./node_modules/@fontsource/inter/files/inter-latin-*-italic.woff",
      "./node_modules/@fontsource/lora/files/lora-latin-*-normal.woff",
      "./node_modules/@fontsource/lora/files/lora-latin-*-italic.woff",
      "./node_modules/@fontsource/anton/files/anton-latin-*-normal.woff",
      "./node_modules/@fontsource/roboto-mono/files/roboto-mono-latin-*-normal.woff",
    ],
  },
};

export default nextConfig;
