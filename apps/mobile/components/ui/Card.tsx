/**
 * The member register's default container: a ground, a hairline, one radius.
 *
 * Elevation defaults to `flat`, which in this token set means a border and no
 * shadow at all. A shadow should mean something has genuinely lifted — a sheet,
 * a dragged row — not that a card exists.
 */
import { elevation, radius, space } from "@csa/design-tokens";
import type { ElevationName, Surface } from "@csa/design-tokens";
import { shadowStyle } from "@csa/design-tokens/native";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";

import { useTheme } from "@/lib/theme";

import { SurfaceProvider } from "./Surface";

export interface CardProps {
  children: ReactNode;
  /** Defaults to the theme's card surface. Pass `brand.subtle` for a member
   *  marker, `status.*.subtle` for a quiet banner. */
  surface?: Surface;
  level?: ElevationName;
  padding?: keyof typeof space;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, surface, level = "flat", padding = 4, style }: CardProps) {
  const theme = useTheme();
  const ground = surface ?? theme.surface.card;
  const raised = elevation[level];

  return (
    <SurfaceProvider surface={ground}>
      <View
        style={[
          {
            backgroundColor: ground.ground,
            borderRadius: radius.card,
            padding: space[padding],
            borderWidth: raised.usesHairline ? 1 : 0,
            borderColor: ground.hairline,
          },
          level === "flat" ? null : shadowStyle(level),
          style,
        ]}
      >
        {children}
      </View>
    </SurfaceProvider>
  );
}
