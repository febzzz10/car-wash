import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.tmp/**",
      "**/.wrangler/**",
      "output/**",
      "tmp/**",
      "coverage/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["scripts/**/*.mjs", "tools/**/*.mjs", "apps/api/scripts/validate-production-deploy.mjs"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        console: "readonly",
        crypto: "readonly",
        fetch: "readonly",
        Headers: "readonly",
        process: "readonly",
        Request: "readonly",
        Response: "readonly",
        structuredClone: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    files: ["apps/api/scripts/r2-migration-bridge.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        crypto: "readonly",
        fetch: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        structuredClone: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
  },
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
);
