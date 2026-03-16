import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(process.cwd()),
    resolveAlias: {
      // Prevent pdfjs-dist from trying to load pdf.worker.mjs in server context
      "pdfjs-dist/legacy/build/pdf.worker.mjs": "",
      "pdfjs-dist/build/pdf.worker.mjs": "",
    },
  },
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
