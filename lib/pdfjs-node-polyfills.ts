// lib/pdfjs-node-polyfills.ts
// pdfjs-dist expects browser-like globals in Node runtimes. On Vercel we
// provide them explicitly from @napi-rs/canvas before loading pdfjs.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const canvas = require("@napi-rs/canvas") as {
  DOMMatrix?: unknown;
  ImageData?: unknown;
  Path2D?: unknown;
};

const globals = globalThis as typeof globalThis & {
  DOMMatrix?: unknown;
  ImageData?: unknown;
  Path2D?: unknown;
};

if (!globals.DOMMatrix && canvas.DOMMatrix) {
  globals.DOMMatrix = canvas.DOMMatrix;
}

if (!globals.ImageData && canvas.ImageData) {
  globals.ImageData = canvas.ImageData;
}

if (!globals.Path2D && canvas.Path2D) {
  globals.Path2D = canvas.Path2D;
}

export {};
