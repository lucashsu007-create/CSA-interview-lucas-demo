/**
 * A labelled fact: "Doors", "Location", "Deadline".
 *
 * The label is muted and the value is ink, so hierarchy comes from weight and
 * colour rather than from boxing each row. `value` is required and there is no
 * "unknown" default on purpose — a caller with nothing to show passes the words
 * it wants to say instead of letting a component invent a dash.
 */
import { space } from "@csa/design-tokens";
import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";

import { AppText } from "./AppText";
import { Icon } from "./Icon";

export interface MetaRowProps {
  icon: LucideIcon;
  label: string;
  value: string;
  /** A second line under the value: a countdown, a caveat. */
  note?: string;
  /** Prices and counts line up when they are tabular. */
  numeric?: boolean;
}

export function MetaRow({ icon, label, value, note, numeric = false }: MetaRowProps) {
  return (
    <View style={{ flexDirection: "row", columnGap: space[3], alignItems: "flex-start" }}>
      <View style={{ paddingTop: space.px }}>
        <Icon icon={icon} size="md" tone="muted" />
      </View>
      <View style={{ flex: 1, rowGap: space.px }}>
        <AppText step="caption" tone="muted">
          {label}
        </AppText>
        <AppText step="body" weight={500} numeric={numeric}>
          {value}
        </AppText>
        {note ? (
          <AppText step="bodySm" tone="muted">
            {note}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
