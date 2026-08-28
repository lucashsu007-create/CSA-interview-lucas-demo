import { defineConfig } from "vitest/config";

/**
 * Root Vitest config for the CSA Digital Hub workspace.
 *
 * One project covering `packages/*` rather than a per-package config, because the
 * shared packages are plain TypeScript with no runtime-specific setup. The apps bring
 * their own configs in Wave 1 (Expo needs a React Native transform, Next needs a jsdom
 * or browser environment), and `tests/critical-flow` is left out until the wave that
 * owns it decides whether those flows run under Vitest or Playwright.
 *
 * Cross-package imports (`@csa/domain` and friends) resolve through the pnpm workspace
 * symlinks — no `resolve.alias` here on purpose, so tests load packages exactly the way
 * the bundlers do rather than through a second, drifting path map.
 */
export default defineConfig({
  test: {
    environment: "node",

    // Globals are on so a test file works whether or not it imports `describe`/`expect`.
    // Explicit imports from "vitest" are still preferred and still work. `vitest/globals`
    // is in the root tsconfig "types" so both styles typecheck.
    globals: true,

    // The scaffold has no tests yet; without this an empty workspace fails `pnpm test`.
    // Turn it off once the first package ships tests, so a broken include glob is loud.
    passWithNoTests: true,

    include: ["packages/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.expo/**",
      "apps/**",
      "tests/critical-flow/**",
    ],

    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["packages/**/*.{ts,tsx}"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/*.d.ts",
        "**/*.{test,spec}.{ts,tsx}",
        "**/*.config.{ts,js,mts,mjs,cts,cjs}",
        "**/__fixtures__/**",
        "**/__mocks__/**",
      ],
      // Workspace convention. Only enforced under `pnpm test:coverage`.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
