/**
 * The app's single theme hook.
 *
 * `@csa/design-tokens/native` deliberately has no dependency on `react-native`,
 * not even a type import, so it cannot call `useColorScheme()` itself. It takes
 * ours instead. This file is the one place that injection happens; everywhere
 * else the hook is simply imported from here.
 *
 * The narrowing below is real and not ceremony: React Native 0.86 can report
 * `'unspecified'`, which the token package's structural `ColorSchemeName` does
 * not name. It means exactly what `null` means there — no preference expressed,
 * resolve to light — so it is mapped rather than cast.
 *
 * A component that branches on the colour scheme itself, or that reads
 * `lightTheme` / `darkTheme` directly, has re-created the bug the token package
 * exists to prevent. Read a resolved `Theme` and nothing else.
 */
import { createUseTheme, type ColorSchemeName } from "@csa/design-tokens/native";
import { useColorScheme as useNativeColorScheme } from "react-native";

function useResolvedColorScheme(): ColorSchemeName {
  const scheme = useNativeColorScheme();
  if (scheme === "dark") return "dark";
  if (scheme === "light") return "light";
  return null;
}

export const useTheme = createUseTheme(useResolvedColorScheme);

export type { Theme, Surface } from "@csa/design-tokens";
