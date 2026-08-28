/**
 * The shape of an `EventCard` before it has content.
 *
 * Mirrors the real layout — badge row, title, three detail lines, price line —
 * so arriving content does not jump the list. A spinner would be less work and
 * would tell the reader nothing about what is coming.
 */
import { space, typeScale } from "@csa/design-tokens";
import { View } from "react-native";

import { Card } from "@/components/ui/Card";
import { SkeletonBlock } from "@/components/ui/States";

export function EventCardSkeleton() {
  return (
    <Card padding={4}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ rowGap: space[3] }}
      >
        {/* Heights come off the type scale, not off a ruler: these blocks stand
            in for a badge row, a title, three detail lines and a price line. */}
        <View style={{ flexDirection: "row", columnGap: space[2] }}>
          <SkeletonBlock height={typeScale.caption.lineHeight + space[2]} width="28%" />
          <SkeletonBlock height={typeScale.caption.lineHeight + space[2]} width="22%" />
        </View>
        <SkeletonBlock height={typeScale.title.lineHeight} width="80%" />
        <View style={{ rowGap: space[2] }}>
          <SkeletonBlock height={typeScale.bodySm.lineHeight} width="60%" />
          <SkeletonBlock height={typeScale.bodySm.lineHeight} width="70%" />
          <SkeletonBlock height={typeScale.bodySm.lineHeight} width="50%" />
        </View>
        <SkeletonBlock height={typeScale.bodySm.lineHeight + space[1]} width="65%" />
      </View>
    </Card>
  );
}
