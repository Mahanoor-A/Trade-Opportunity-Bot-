import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "out/**", "build/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
];

export default eslintConfig;
