/**
 * A badge marks a state that changes. Not a label, not decoration.
 *
 * Colour is never the only signal here: a status badge always carries the token
 * set's own icon alongside its text. That matters more for CSA than for most
 * products, because the brand colour IS red — a red chip does not read as "error"
 * against red chrome, so the icon and the word are doing the work and the colour
 * is confirming it.
 */
import { radius, space } from "@csa/design-tokens";
import type { StatusIconName, StatusName } from "@csa/design-tokens";
import { CircleCheck, CircleX, Info, TriangleAlert, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";

import { useTheme } from "@/lib/theme";

import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { SurfaceProvider } from "./Surface";

const STATUS_ICONS: Record<StatusIconName, LucideIcon> = {
  CircleCheck,
  TriangleAlert,
  CircleX,
  Info,
};

export type BadgeTone = "neutral" | "brand" | StatusName;

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  variant?: "subtle" | "solid";
  /** Status tones carry their icon by default; `false` drops it where the row
   *  already says the same thing in words. */
  withIcon?: boolean;
  icon?: LucideIcon;
}

export function Badge({
  label,
  tone = "neutral",
  variant = "subtle",
  withIcon = true,
  icon,
}: BadgeProps) {
  const theme = useTheme();

  const status = tone === "neutral" || tone === "brand" ? null : theme.status[tone];
  const surface =
    tone === "neutral"
      ? theme.surface.sunken
      : tone === "brand"
        ? variant === "solid"
          ? theme.brand.solid
          : theme.brand.subtle
        : variant === "solid"
          ? status!.solid
          : status!.subtle;

  const glyph = icon ?? (status && withIcon ? STATUS_ICONS[status.icon] : undefined);

  return (
    <SurfaceProvider surface={surface}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          columnGap: space[1],
          paddingHorizontal: space[2],
          paddingVertical: space[1],
          borderRadius: radius.pill,
          backgroundColor: surface.ground,
          borderWidth: 1,
          borderColor: surface.hairline,
          alignSelf: "flex-start",
        }}
      >
        {glyph ? <Icon icon={glyph} size="sm" /> : null}
        <AppText step="caption" weight={600}>
          {label}
        </AppText>
      </View>
    </SurfaceProvider>
  );
}
