// Builds the NubeSDK worker app from nubesdk-src/ into public/:
//   nubesdk-src/main.ts -> public/nuvemshop-nubesdk-app.js
// This is the file uploaded to the Nuvemshop Partners portal script with
// "Use NubeSDK" ENABLED. It must be ESM (the SDK imports the module and
// calls its exported App(nube)) and self-contained (deps bundled — the
// portal serves a single file). Unlike widget.js it never touches the DOM:
// it runs in Nuvemshop's sandboxed web worker.
//
// esbuild is resolved through vite exactly like build-widget.mjs.
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

const result = await build({
  entryPoints: [join(clientDir, "nubesdk-src/main.ts")],
  outfile: join(clientDir, "public/nuvemshop-nubesdk-app.js"),
  bundle: true,
  format: "esm",
  target: "es2020",
  minify: true,
  sourcemap: "linked",
  charset: "utf8",
  logLevel: "info",
});
if (result.errors.length > 0) process.exit(1);
