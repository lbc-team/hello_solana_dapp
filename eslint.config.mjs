import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Codama files:
    "app/generated/**",
    // Anchor tests are compiled and run by Anchor/mocha, not by the Next app:
    "anchor/tests/**",
    "anchor/test-support/**",
  ]),
]);

export default eslintConfig;
