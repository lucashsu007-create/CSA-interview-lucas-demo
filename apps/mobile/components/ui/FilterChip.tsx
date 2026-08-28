/**
 * One option of a single-select filter.
 *
 * Selection is announced through `accessibilityState.selected`, not implied by
 * colour — a chip that is only visually filled is unselectable information to a
 * screen reader. The rendered height sits below the touch floor on purpose so
 * a row of chips is not enormous; `hitSlop` puts the target back at 48.
 */
import { radius, size, space } from "@csa/design-tokens";
import { hitSlopFor, stateOpacity } from "@csa/design-tokens/native";
import { Pressable } from "react-native";

import { useTheme } from "@/lib/theme";

import { AppText } from "./AppText";
import { SurfaceProvider } from "./Surface";

export interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Read after the label, e.g. "Shows only social events". */
  accessibilityHint?: string;
}

const CHIP_HEIGHT = size.control.md;

export function FilterChip({ label, selected, onPress, accessibilityHint }: FilterChipProps) {
  const theme = useTheme();
  const surface = selected ? theme.brand.solid : theme.surface.card;

  return (
    <SurfaceProvider surface={surface}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ selected }}
        hitSlop={hitSlopFor(CHIP_HEIGHT)}
        style={({ pressed }) => ({
          height: CHIP_HEIGHT,
          paddingHorizontal: space[4],
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: surface.ground,
          borderWidth: 1,
          borderColor: selected ? surface.ground : surface.outline,
          opacity: stateOpacity({ pressed }),
        })}
      >
        <AppText step="bodySm" weight={600}>
          {label}
        </AppText>
      </Pressable>
    </SurfaceProvider>
  );
}
