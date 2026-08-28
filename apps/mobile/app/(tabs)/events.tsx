/**
 * The events list.
 *
 * A `FlatList` with a stable `keyExtractor`, not an array mapped inside a
 * `ScrollView`. Mapping works on a seeded dataset and stops working on a real
 * one; the list is the surface most likely to grow.
 *
 * Filtering is server-side — the chosen category is passed to `GET /api/events`
 * as `?category=`, which is the route the contract defines. Filtering an
 * already-fetched array would look identical today and be wrong the moment the
 * list is paginated.
 */
import { space } from "@csa/design-tokens";
import type { EventCategory } from "@csa/domain";
import { useRouter } from "expo-router";
import { CalendarDays } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

import { CategoryFilterBar } from "@/components/events/CategoryFilterBar";
import { EventCard } from "@/components/events/EventCard";
import { EventCardSkeleton } from "@/components/events/EventCardSkeleton";
import { AppText } from "@/components/ui/AppText";
import { Screen, useScrollBottomPadding } from "@/components/ui/Screen";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { listEvents, type EventListItem } from "@/lib/api";
import { categoryLabel } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useAsync } from "@/lib/useAsync";

const GUTTER = space[4];

/**
 * Upcoming first, soonest at the top; then past events, most recent first.
 *
 * Presentation only — it reorders what the server sent and invents nothing.
 * `GET /api/events` returns published events, and the seed deliberately includes
 * events that have already happened.
 */
function orderForReading(events: readonly EventListItem[], now: Date): EventListItem[] {
  const instant = now.getTime();
  const upcoming = events
    .filter((event) => event.startsAt.getTime() >= instant)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = events
    .filter((event) => event.startsAt.getTime() < instant)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return [...upcoming, ...past];
}

export default function EventsScreen() {
  const router = useRouter();
  const { token } = useSession();
  const [category, setCategory] = useState<EventCategory | null>(null);
  const bottomPadding = useScrollBottomPadding();

  const load = useCallback(
    (signal: AbortSignal) => listEvents({ token, category, signal }),
    [token, category],
  );
  const state = useAsync(load, [token, category]);

  const now = useMemo(() => new Date(), [state.data]);
  const events = useMemo(
    () => (state.data ? orderForReading(state.data, now) : []),
    [state.data, now],
  );

  const header = (
    <View>
      <View style={{ paddingHorizontal: GUTTER, paddingTop: space[4], rowGap: space[1] }}>
        <AppText step="display">Events</AppText>
        <AppText step="bodySm" tone="muted">
          Everything the association has published. Browsing does not need an identity.
        </AppText>
      </View>
      <CategoryFilterBar selected={category} onSelect={setCategory} gutter={GUTTER} />
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={events}
        keyExtractor={(event) => event.id}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: GUTTER }}>
            <EventCard
              event={item}
              now={now}
              onPress={() => router.push({ pathname: "/event/[id]", params: { id: item.id } })}
            />
          </View>
        )}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={{ height: space[3] }} />}
        ListFooterComponent={<View style={{ height: space[4] }} />}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        initialNumToRender={6}
        refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} />}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: GUTTER, paddingTop: space[4] }}>
            {state.status === "loading" ? (
              <View style={{ rowGap: space[3] }}>
                <EventCardSkeleton />
                <EventCardSkeleton />
                <EventCardSkeleton />
              </View>
            ) : state.status === "error" ? (
              <ErrorState
                title="Events could not be loaded"
                body={state.error?.message ?? "The committee portal did not answer."}
                onRetry={state.reload}
              />
            ) : category ? (
              <EmptyState
                icon={CalendarDays}
                title={`No ${categoryLabel(category).toLowerCase()} events`}
                body="Nothing is published in this category right now."
                action={{ label: "Show all events", onPress: () => setCategory(null) }}
              />
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No events published"
                body="When the committee publishes an event it appears here."
              />
            )}
          </View>
        }
      />
    </Screen>
  );
}
