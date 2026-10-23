import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["**/*.md"],
  },
  lint: {
    ignorePatterns: [
      "**/*.md",
      ".agents/skills/setup-ts-deep-modules/dependency-cruiser.config.cjs",
      "userscript.header.js",
    ],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["tests/**/*.test.ts"],
        rules: { "typescript/unbound-method": "off" },
      },
    ],
  },
});
