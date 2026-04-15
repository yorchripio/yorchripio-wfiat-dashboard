import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(process.cwd()),
  },
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
