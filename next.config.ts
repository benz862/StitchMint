import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "pdfkit", "@napi-rs/canvas"],
};

export default nextConfig;
