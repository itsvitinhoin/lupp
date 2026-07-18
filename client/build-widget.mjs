// Builds the storefront embed script from widget-src/ into public/:
//   widget-src/main.js                -> public/widget.js (core, same URL as before)
//   widget-src/platforms/upzero.js    -> public/widget-upzero.js
//   widget-src/platforms/shopify.js   -> public/widget-shopify.js
//   widget-src/platforms/nuvemshop.js -> public/widget-nuvemshop.js
// The platform adapters are lazily injected by the core at runtime (see the
// widget bridge in widget-src/main.js). Outputs are unminified IIFEs so
// production diffs stay reviewable.
//
// esbuild compiles the TypeScript sources natively (types are simply
// stripped) — no plugins needed.
//
// esbuild is not a direct dependency: it is resolved through vite (which
// pins it), so no extra install is required.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const clientDir = dirname(fileURLToPath(import.meta.url));

function resolveEsbuild() {
  try {
    return require.resolve("esbuild");
  } catch {
    const viteDir = dirname(require.resolve("vite/package.json"));
    return require.resolve("esbuild", { paths: [viteDir] });
  }
}

const { build } = await import(pathToFileURL(resolveEsbuild()).href);

const entries = [
  ["widget-src/main.ts", "public/widget.js"],
  ["widget-src/platforms/upzero.ts", "public/widget-upzero.js"],
  ["widget-src/platforms/shopify.ts", "public/widget-shopify.js"],
  ["widget-src/platforms/nuvemshop.ts", "public/widget-nuvemshop.js"],
];

for (const [entry, outfile] of entries) {
  const result = await build({
    entryPoints: [join(clientDir, entry)],
    outfile: join(clientDir, outfile),
    bundle: true,
    format: "iife",
    target: "es2017",
    minify: false,
    charset: "utf8",
    logLevel: "info",
  });
  if (result.errors.length > 0) process.exit(1);
}
