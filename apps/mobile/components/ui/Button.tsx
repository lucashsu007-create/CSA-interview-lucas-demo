/**
 * Anything that looks like a button is this.
 *
 * If you find yourself writing a padding and a radius onto a raw `Pressable`,
 * that is this component being re-implemented.
 *
 * The interaction model is the app's, not the portal's: PRESSED and DISABLED.
 * There is no hover and no focus ring on a touch device, so a web component's
 * states are not ported literally. Disabled is reduced opacity PLUS
 * non-interactivity PLUS `accessibilityState`, never opacity alone — an element
 * that only looks disabled is fully operable to a screen reader.
 *
 * Every size clears the 48pt touch floor: `lg` by its own height, `md` by
 * `hitSlop`. Shrinking a target below the floor is not an available trade.
 */
import { radius, size, space } from "@csa/design-tokens";
import { hitSlopFor, stateOpacity } from "@csa/design-tokens/native";
import type { LucideIcon } from "lucide-react-native";
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/lib/theme";

import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { SurfaceProvider, useSurface } from "./Surface";

export type ButtonVariant = "primary" | "secondary" | "quiet";
export type ButtonSize = "md" | "lg";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  /** `trailing` for a forward affordance — an arrow before the label reads as back. */
  iconSide?: "leading" | "trailing";
  disabled?: boolean;
  busy?: boolean;
  /** Announced instead of `label` when the label alone is not self-explanatory. */
  accessibilityLabel?: string;
  /** Read after the label — why the control is disabled, what happens next. */
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<ButtonSize, number> = {
  md: size.control.md,
  lg: size.control.lg,
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size: scale = "lg",
  icon,
  iconSide = "leading",
  disabled = false,
  busy = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const host = useSurface();
  const inactive = disabled || busy;

  // Each variant is a full surface, so the label and any icon read their ink
  // from the ground they are actually standing on.
  const surface =
    variant === "primary"
      ? theme.brand.solid
      : { ...host, ink: variant === "quiet" ? theme.link.ink : host.ink };

  const height = HEIGHT[scale];

  return (
    <SurfaceProvider surface={surface}>
      <Pressable
        onPress={onPress}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: inactive, busy }}
        hitSlop={hitSlopFor(height)}
        style={({ pressed }) => [
          {
            minHeight: height,
            paddingHorizontal: variant === "quiet" ? space[2] : space[5],
            borderRadius: radius.control,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            columnGap: space[2],
            backgroundColor: variant === "primary" ? surface.ground : "transparent",
            borderWidth: variant === "secondary" ? 1 : 0,
            borderColor: host.outline,
            opacity: stateOpacity({ pressed, disabled: inactive }),
          },
          style,
        ]}
      >
        {busy ? <ActivityIndicator size="small" color={surface.ink} /> : null}
        {!busy && icon && iconSide === "leading" ? <Icon icon={icon} size="md" /> : null}
        <View>
          <AppText step="body" weight={600} numberOfLines={1}>
            {label}
          </AppText>
        </View>
        {!busy && icon && iconSide === "trailing" ? <Icon icon={icon} size="md" /> : null}
      </Pressable>
    </SurfaceProvider>
  );
}
