import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/*.d.ts",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...js.configs.recommended,
    languageOptions: {
      globals: {
        AbortSignal: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [...tseslint.configs.strict, ...tseslint.configs.stylistic],
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { "prefer": "type-imports" }],
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
