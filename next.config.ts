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
    "/api/patterns/**": [
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
