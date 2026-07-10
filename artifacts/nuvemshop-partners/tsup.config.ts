import { defineConfig } from "tsup";

export default defineConfig({
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
});
