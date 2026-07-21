import { defineConfig } from "vitest/config";
import path from "path";

// Mirrors server/vitest.config.ts's alias convention. Scoped to pure
// logic/hooks (src/**/*.spec.ts) — component/page trees aren't covered here;
// see CLAUDE.md's widget behavior harness for DOM-level widget checks.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.spec.ts", "widget-src/**/*.spec.ts"],
  },
});
