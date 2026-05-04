import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "pdfkit", "@napi-rs/canvas"],
  /**
   * Force Next.js's serverless function tracer to include the bundled @fontsource WOFF files. The
   * font registration code uses dynamic require.resolve(`@fontsource/...`) paths which the static
   * tracer can miss, leading to "no text in preview" on Vercel even though it works locally. This
   * pattern lists each @fontsource package's files folder so every .woff ships with the function.
   */
  outputFileTracingIncludes: {
    /**
     * Match every API route that runs server-side rasterization. The customer flow is at
     * /api/patterns/**, the admin sample-pack builders are at /api/admin/**, both call into
     * applyOverlayDraftToImageBuffer and need the woff files present at runtime. Restricting to
     * /api/patterns/** would silently break admin previews even though local dev works.
     */
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
