import { tailwindDarkMode, tailwindTheme } from "@csa/design-tokens/tailwind";
import type { Config } from "tailwindcss";

/**
 * The portal's entire visual vocabulary, taken whole from @csa/design-tokens.
 *
 * `theme` and NOT `theme.extend` on purpose — see the note at the top of the
 * bridge. Replacing the defaults deletes `rounded-xl`, `text-2xl`, `bg-red-500`
 * and `p-[13px]` from the vocabulary entirely, so a component physically cannot
 * reach a value the mobile app does not also have.
 *
 * There is not a single literal in this file, and there must never be one.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  /*
   * The token package is runtime-neutral and does not import Tailwind's types,
   * so it types this as `[string, string[]]` rather than Tailwind's literal
   * tuple. The value is the right one; only the literal-ness is lost crossing
   * the boundary, which is what this assertion restores.
   */
  darkMode: tailwindDarkMode as Config["darkMode"],
  theme: {
    ...tailwindTheme,
    extend: {
      // Deliberately empty. A value that belongs here belongs in the tokens.
    },
  },
};

export default config;
