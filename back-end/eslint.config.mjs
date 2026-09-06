import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Flat config (ESLint 9), matching front-end/eslint.config.mjs in spirit. The
// front-end's `next` presets don't apply to a Node server, so this is the
// plain @eslint/js + typescript-eslint recommended pairing.
export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "src/generated/**"] },
  {
    files: ["src/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
