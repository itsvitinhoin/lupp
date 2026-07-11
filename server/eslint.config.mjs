// eslint.config.mjs
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import vitestGlobals from "eslint-plugin-vitest-globals";
import prettier from "eslint-config-prettier";

export default [
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      // replaces: { "env": { "vitest-globals/env": true } }
      globals: vitestGlobals.environments.env.globals,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "vitest-globals": vitestGlobals,
    },
    rules: {
      "no-useless-constructor": "off",
      camelcase: "off",
      "no-new": "off",
      "@typescript-eslint/no-empty-interface": "off",
    },
  },

  // Keep Prettier last to turn off formatting-conflict rules
  prettier,
];
