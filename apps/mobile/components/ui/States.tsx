/**
 * Empty, loading, error. Three different states, kept distinct.
 *
 *   - EMPTY carries exactly one action and says plainly that there is nothing,
 *     rather than implying a failure.
 *   - ERROR announces itself to assistive technology and offers a retry. It
 *     never renders as an empty list, which would be a lie about the data.
 *   - LOADING mirrors the real layout as a skeleton rather than a generic bar,
 *     so content arriving does not shift the page.
 */
import { radius, space } from "@csa/design-tokens";
import { CircleAlert, Inbox, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";

import { useTheme } from "@/lib/theme";

import { AppText } from "./AppText";
import { Button } from "./Button";
import { Card } from "./Card";
import { Icon } from "./Icon";

export interface EmptyStateProps {
  title: string;
  body: string;
  icon?: LucideIcon;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ title, body, icon = Inbox, action }: EmptyStateProps) {
  return (
    <View style={{ alignItems: "center", paddingVertical: space[12], rowGap: space[3] }}>
      <Icon icon={icon} size="lg" tone="muted" />
      <AppText step="title" style={{ textAlign: "center" }}>
        {title}
      </AppText>
      <AppText step="bodySm" tone="muted" style={{ textAlign: "center", maxWidth: space[20] * 4 }}>
        {body}
      </AppText>
      {action ? (
        <Button label={action.label} onPress={action.onPress} variant="secondary" size="md" />
      ) : null}
    </View>
  );
}

export interface ErrorStateProps {
  title: string;
  body: string;
  onRetry?: () => void;
}

export function ErrorState({ title, body, onRetry }: ErrorStateProps) {
  const theme = useTheme();

  return (
    <Card surface={theme.status.danger.subtle} padding={5}>
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={{ rowGap: space[2] }}
      >
        {/* Top-aligned, not centred: a title that wraps to two lines would
            otherwise float the icon into the middle of the block. */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", columnGap: space[2] }}>
          <View style={{ paddingTop: space.px }}>
            <Icon icon={CircleAlert} size="md" />
          </View>
          <AppText step="title" style={{ flex: 1 }}>
            {title}
          </AppText>
        </View>
        <AppText step="bodySm" tone="muted">
          {body}
        </AppText>
      </View>
      {onRetry ? (
        <Button
          label="Try again"
          onPress={onRetry}
          variant="secondary"
          size="md"
          style={{ marginTop: space[3], alignSelf: "flex-start" }}
        />
      ) : null}
    </Card>
  );
}

/** A neutral block the size of the content it stands in for. */
export function SkeletonBlock({
  height,
  width = "100%",
}: {
  height: number;
  width?: number | `${number}%`;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height,
        width,
        borderRadius: radius.control,
        backgroundColor: theme.surface.sunken.ground,
        borderWidth: 1,
        borderColor: theme.surface.sunken.hairline,
      }}
    />
  );
}
