import tseslint from "typescript-eslint";
export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".server-build/**",
      "data/**",
      "public/**",
      "test-results/**",
      ".local-admin/**",
    ],
  },
  {
    files: [
      "src/**/*.{ts,tsx}",
      "shared/**/*.ts",
      "server/**/*.ts",
      "tests/**/*.ts",
      "e2e/**/*.ts",
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-debugger": "error",
      "no-eval": "error",
      "no-dupe-args": "error",
      "no-unreachable": "error",
      eqeqeq: "error",
    },
  },
  {
    files: [
      "worker/**/*.mjs",
      "shared/**/*.mjs",
      "scripts/**/*.{mjs,cjs}",
      "tests/**/*.js",
    ],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: {
      "no-debugger": "error",
      "no-eval": "error",
      "no-dupe-args": "error",
      "no-unreachable": "error",
      eqeqeq: "error",
    },
  },
];
