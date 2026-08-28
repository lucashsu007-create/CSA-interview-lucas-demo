/**
 * The one icon binding for this runtime.
 *
 * Lucide, matching the committee portal's `lucide-react` and matching the names
 * the token package already uses for status signals (`StatusIconName`). One
 * library per runtime, chosen once.
 *
 * The colour comes from the enclosing surface for the same reason text does, and
 * the size comes from `size.icon`. An icon here must disambiguate a state or
 * name an action — decoration added for texture is slop.
 */
import { size } from "@csa/design-tokens";
import type { LucideIcon } from "lucide-react-native";

import { useSurface } from "./Surface";

export type IconSize = keyof typeof size.icon;

export interface IconProps {
  icon: LucideIcon;
  size?: IconSize;
  tone?: "default" | "muted";
  color?: string;
}

export function Icon({ icon: Glyph, size: scale = "md", tone = "default", color }: IconProps) {
  const surface = useSurface();
  const resolved = color ?? (tone === "muted" ? surface.inkMuted : surface.ink);
  return <Glyph size={size.icon[scale]} color={resolved} strokeWidth={2} />;
}
