/**
 * @csa/design-tokens — CSA's runtime-neutral material layer.
 *
 *   import { lightTheme, typeScale, space } from '@csa/design-tokens';
 *   import { tailwindTheme, themeCss } from '@csa/design-tokens/tailwind';
 *   import { createUseTheme, textStyle } from '@csa/design-tokens/native';
 *
 * Public web, operations web, and native all consume these materials. Motion
 * timing and behavior are owned by `@csa/motion`, not this package. `./tailwind`
 * and `./native` are deliberately NOT re-exported here: importing the wrong
 * bridge should remain a loud runtime-boundary error.
 *
 * Read `tokens.ts` before changing a value — especially the PROVENANCE block,
 * which records what CSA has actually published versus what this repo chose.
 */

export * from "./contrast";
export * from "./tokens";

export { lightTheme } from "./light";
export { darkTheme } from "./dark";

import { darkTheme } from "./dark";
import { lightTheme } from "./light";
import type { Theme, ThemeName } from "./tokens";

/** Both themes by name. `resolveTheme` in `./native` is the usual way in. */
export const themes: Readonly<Record<ThemeName, Theme>> = {
  light: lightTheme,
  dark: darkTheme,
};
