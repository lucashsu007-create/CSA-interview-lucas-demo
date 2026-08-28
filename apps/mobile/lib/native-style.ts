/**
 * The seam between `@csa/design-tokens/native` and React Native's own style
 * types.
 *
 * The token package deliberately has no dependency on `react-native`, not even a
 * type import — the committee portal imports the same package, and pulling RN
 * types into a Next.js typecheck is how a shared package stops being shared.
 * The cost of that decision is three structural mismatches, all of them narrow
 * and all of them absorbed here rather than at forty call sites:
 *
 *   1. `NativeTextStyle.fontWeight` is `string`; RN's `TextStyle` wants the
 *      literal union `'400' | '500' | ...`. Same values, wider type.
 *   2. `tabularNumbers.fontVariant` is a frozen `readonly` tuple; RN's
 *      `TextStyle` wants a mutable `FontVariant[]`.
 *   3. RN 0.86's `ColorSchemeName` includes `'unspecified'`, which the token
 *      package's structural version does not name. It means the same thing as
 *      `null` — no preference expressed — and is mapped to it in `theme.ts`.
 *
 * None of these is a token bug. They are the price of runtime neutrality, paid
 * once, in one file.
 */
import { textStyle, tabularNumbers } from "@csa/design-tokens/native";
import type { FontWeight, TypeStep, TypeStepName } from "@csa/design-tokens";
import type { TextStyle } from "react-native";

export function typeStepStyle(
  step: TypeStepName | TypeStep,
  options: { family?: "sans" | "mono"; weight?: FontWeight } = {},
): TextStyle {
  const resolved = textStyle(step, options);
  return {
    fontFamily: resolved.fontFamily,
    fontSize: resolved.fontSize,
    lineHeight: resolved.lineHeight,
    letterSpacing: resolved.letterSpacing,
    fontWeight: resolved.fontWeight as TextStyle["fontWeight"],
  };
}

/** Numbers that get compared against other numbers. See the token doc comment. */
export const tabularStyle: TextStyle = {
  fontVariant: [...tabularNumbers.fontVariant],
};
