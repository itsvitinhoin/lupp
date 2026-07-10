import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { "luup-nuvemshop-partners": "src/main.ts" },
    format: ["esm"],
    target: "es2022",
    bundle: true,
    noExternal: [/.*/],
    minify: true,
    sourcemap: false,
    clean: true,
    dts: false,
    splitting: false,
    outDir: "dist",
    outExtension: () => ({ js: ".js" }),
  },
  {
    entry: { "luup-nuvemshop-transition": "src/transition.js" },
    format: ["iife"],
    target: "es2018",
    bundle: true,
    minify: true,
    sourcemap: false,
    clean: false,
    dts: false,
    splitting: false,
    outDir: "dist",
    outExtension: () => ({ js: ".js" }),
  },
]);
