// lib/pdfjs-node-polyfills.ts
// pdfjs-dist expects browser-like globals in Node runtimes. On Vercel we
// provide them explicitly from @napi-rs/canvas before loading pdfjs.

let canvas: {
  DOMMatrix?: unknown;
  ImageData?: unknown;
  Path2D?: unknown;
} = {};

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  canvas = require("@napi-rs/canvas") as typeof canvas;
} catch {
  // Optional in some runtimes; pdfjs can still run without setting these globals.
}

const globals = globalThis as Record<string, unknown>;

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
