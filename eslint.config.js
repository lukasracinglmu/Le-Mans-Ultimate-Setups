import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig([
  {
    ignores: [
      "setups/",
      "audit-logs/",
      // Stored base64-encoded since commit 6578b70; restore it before linting (issue #3).
      "tests/login-only-controls.test.mjs",
    ],
  },
  {
    files: ["**/*.{js,mjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      // Input sanitizers intentionally strip control characters.
      "no-control-regex": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Existing findings are reported as warnings until they are cleaned up.
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-useless-escape": "warn",
      "preserve-caught-error": "warn",
    },
  },
  {
    // Cloudflare Worker modules
    files: ["*.js"],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },
  {
    files: ["discord-presence/**/*.js", "tests/**/*.mjs", "tools/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
