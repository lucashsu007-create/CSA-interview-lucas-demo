/**
 * Every string in the app goes through here.
 *
 * Two things it exists to make impossible:
 *
 *   - Picking a font size. `step` names a step of the type scale and the step
 *     arrives whole — size, line height, letter spacing and weight together.
 *     Overriding one of them at a call site is fighting a tuned scale.
 *   - Picking a text colour. `tone` chooses ink or muted ink FROM THE SURFACE
 *     the text is standing on, which is the only pairing guaranteed to clear AA.
 */
import type { FontWeight, TypeStepName } from "@csa/design-tokens";
import { Text, type StyleProp, type TextProps, type TextStyle } from "react-native";

import { tabularStyle, typeStepStyle } from "@/lib/native-style";

import { useSurface } from "./Surface";

export interface AppTextProps extends Omit<TextProps, "style"> {
  step?: TypeStepName;
  /** Ink from the enclosing surface. `muted` is still held to 4.5:1. */
  tone?: "default" | "muted";
  /** Overrides the step's own weight. Use sparingly; the scale already chose. */
  weight?: FontWeight;
  family?: "sans" | "mono";
  /**
   * For numbers that get compared against other numbers — prices, capacity,
   * countdowns. iOS honours `tabular-nums`; Android often does not, so a column
   * that must genuinely line up should use `family="mono"` instead.
   */
  numeric?: boolean;
  /** An explicit colour, for the rare case where the ink is not the surface's.
   *  Always a token value read from the theme, never a literal. */
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function AppText({
  step = "body",
  tone = "default",
  weight,
  family,
  numeric = false,
  color,
  style,
  ...rest
}: AppTextProps) {
  const surface = useSurface();
  const resolved = color ?? (tone === "muted" ? surface.inkMuted : surface.ink);

  return (
    <Text
      {...rest}
      style={[
        typeStepStyle(step, { family, weight }),
        { color: resolved },
        numeric ? tabularStyle : null,
        style,
      ]}
    />
  );
}
