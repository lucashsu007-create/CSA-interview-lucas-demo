/**
 * One event, as a list row.
 *
 * The whole card is the touch target, which is well above the floor, so no
 * `hitSlop` is needed here — the floor applies to artwork smaller than a thumb,
 * not to a card. It carries one accessibility label reading the row as a
 * sentence, because four separate labels announced in sequence is how a list
 * becomes unusable with a screen reader.
 */
import { space } from "@csa/design-tokens";
import { stateOpacity } from "@csa/design-tokens/native";
import { formatEur } from "@csa/domain";
import { CalendarDays, MapPin, Users } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import type { EventListItem } from "@/lib/api";
import { categoryLabel, formatDayAndMonth, formatTime } from "@/lib/format";

import { EventStatusBadge } from "./EventStatusBadge";
import { PriceLine } from "./PriceBlock";

export interface EventCardProps {
  event: EventListItem;
  now: Date;
  onPress: () => void;
}

/**
 * Places left, in words.
 *
 * Null is NOT zero. When the API did not send a count, the card says the count
 * is not reported rather than printing `0 left`, which would read as "sold out"
 * and be a fabrication.
 */
function capacityText(event: EventListItem): string {
  if (event.spotsRemaining === null) {
    return `${event.capacity} places, remaining not reported`;
  }
  return `${event.spotsRemaining} of ${event.capacity} places left`;
}

export function EventCard({ event, now, onPress }: EventCardProps) {
  const priceSummary =
    event.priceMemberCents === event.pricePublicCents
      ? formatEur(event.priceMemberCents, { zeroLabel: "Free" })
      : `${formatEur(event.priceMemberCents, { zeroLabel: "free" })} for members, ${formatEur(
          event.pricePublicCents,
          { zeroLabel: "free" },
        )} for the public`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}. ${categoryLabel(event.category)}. ${formatDayAndMonth(
        event.startsAt,
      )} at ${formatTime(event.startsAt)}, ${event.location}. ${priceSummary}. ${capacityText(
        event,
      )}.`}
      accessibilityHint="Opens the event details"
      style={({ pressed }) => ({ opacity: stateOpacity({ pressed }) })}
    >
      <Card padding={4}>
        <View style={{ rowGap: space[3] }}>
          <View
            style={{
              flexDirection: "row",
              columnGap: space[2],
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <Badge label={categoryLabel(event.category)} tone="neutral" />
            <EventStatusBadge
              status={event.status}
              registrationDeadlineAt={event.registrationDeadlineAt}
              startsAt={event.startsAt}
              now={now}
            />
          </View>

          <AppText step="title" numberOfLines={2}>
            {event.title}
          </AppText>

          <View style={{ rowGap: space[1] }}>
            <Detail icon={CalendarDays}>
              {`${formatDayAndMonth(event.startsAt)}  ·  ${formatTime(event.startsAt)}`}
            </Detail>
            <Detail icon={MapPin}>{event.location}</Detail>
            <Detail icon={Users}>{capacityText(event)}</Detail>
          </View>

          <PriceLine memberCents={event.priceMemberCents} publicCents={event.pricePublicCents} />
        </View>
      </Card>
    </Pressable>
  );
}

function Detail({
  icon,
  children,
}: {
  icon: React.ComponentProps<typeof Icon>["icon"];
  children: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", columnGap: space[2] }}>
      <Icon icon={icon} size="sm" tone="muted" />
      <AppText step="bodySm" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
        {children}
      </AppText>
    </View>
  );
}
