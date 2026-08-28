/**
 * The screen container: the app ground, and the safe areas.
 *
 * Safe areas are mandatory here, not polish. `useSafeAreaInsets` is read for the
 * TOP (status bar and notch) and the BOTTOM (home indicator) separately, because
 * they are different hardware and a layout that only handles the status bar puts
 * its last row under the gesture bar on every modern phone.
 *
 * Screens render their own header rather than the navigator's, so that titles
 * come from the type scale like every other string in the app.
 */
import { space } from "@csa/design-tokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";

import { useTheme } from "@/lib/theme";

import { SurfaceProvider } from "./Surface";

export interface ScreenProps {
  children: ReactNode;
  /** `false` on screens whose own scroll view should run under the status bar. */
  padTop?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Screen({ children, padTop = true, style }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <SurfaceProvider surface={theme.surface.app}>
      <View
        style={[
          {
            flex: 1,
            backgroundColor: theme.surface.app.ground,
            paddingTop: padTop ? insets.top : 0,
          },
          style,
        ]}
      >
        {children}
      </View>
    </SurfaceProvider>
  );
}

/**
 * Bottom padding for a scrollable region.
 *
 * `extra` clears the tab bar on the tabbed screens; the home indicator inset is
 * added on top of it. Reading the real tab bar height would mean importing from
 * `@react-navigation/bottom-tabs`, which this package does not depend on
 * directly — a phantom dependency in a pnpm workspace is a resolution failure
 * waiting to happen, so the scale value is used instead.
 */
export function useScrollBottomPadding(extra: keyof typeof space = 14): number {
  const insets = useSafeAreaInsets();
  return space[extra] + insets.bottom;
}
