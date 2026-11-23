import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "tmp/**",
      "output/**",
      ".wrangler/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { react },
    settings: { react: { version: "detect" } },
    rules: {
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_|^next$",
          caughtErrors: "none",
          varsIgnorePattern: "^_",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
