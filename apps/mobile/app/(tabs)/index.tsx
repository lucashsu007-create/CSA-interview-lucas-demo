/**
 * Home: who you are, what is next, and one way in.
 *
 * The membership block is the most dangerous piece of UI in this wave, because
 * it is the one a reader will take as fact. It shows only what `GET /api/me`
 * reported. It does not decide whether a membership is active, it does not
 * compute a price, and when nothing has been reported it says so in words
 * instead of rendering an encouraging default.
 */
import { space } from "@csa/design-tokens";
import { useRouter } from "expo-router";
import { ArrowRight, CalendarDays, IdCard } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { EventCard } from "@/components/events/EventCard";
import { EventCardSkeleton } from "@/components/events/EventCardSkeleton";
import { AppText } from "@/components/ui/AppText";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { PrototypeNotice } from "@/components/ui/PrototypeNotice";
import { Screen, useScrollBottomPadding } from "@/components/ui/Screen";
import { ErrorState } from "@/components/ui/States";
import { listEvents } from "@/lib/api";
import { formatDateTimeShort } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useAsync } from "@/lib/useAsync";

const GUTTER = space[4];

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { status, me } = useSession();
  const bottomPadding = useScrollBottomPadding();

  const load = useCallback((signal: AbortSignal) => listEvents({ signal }), []);
  const state = useAsync(load, []);

  const now = useMemo(() => new Date(), [state.data]);
  const nextEvents = useMemo(() => {
    if (!state.data) return [];
    return state.data
      .filter((event) => event.startsAt.getTime() >= now.getTime())
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, 2);
  }, [state.data, now]);

  const greeting =
    status === "signed-in" && me
      ? me.fullName
      : status === "restoring"
        ? "Welcome"
        : "Browsing as a guest";

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: GUTTER,
          paddingBottom: bottomPadding,
          rowGap: space[5],
        }}
        refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} />}
      >
        <View style={{ rowGap: space[1] }}>
          <AppText step="bodySm" tone="muted">
            CSA Rotterdam
          </AppText>
          <AppText step="display">{greeting}</AppText>
        </View>

        <PrototypeNotice />

        {/* Membership. Reported, never derived. */}
        <Card padding={5}>
          <View style={{ rowGap: space[3] }}>
            <View style={{ flexDirection: "row", alignItems: "center", columnGap: space[2] }}>
              <Icon icon={IdCard} size="md" tone="muted" />
              <AppText step="title">Membership</AppText>
            </View>

            {status === "restoring" ? (
              <AppText step="bodySm" tone="muted">
                Checking the stored session.
              </AppText>
            ) : status === "guest" ? (
              <>
                <AppText step="bodySm" tone="muted">
                  No identity chosen, so nothing is known about a membership. Events are readable
                  either way; the public price applies until a membership says otherwise.
                </AppText>
                <Button
                  label="Choose a demo identity"
                  onPress={() => router.push("/identity")}
                  variant="secondary"
                  size="md"
                  style={{ alignSelf: "flex-start" }}
                />
              </>
            ) : me?.activeMembership ? (
              <View style={{ rowGap: space[2] }}>
                <Badge label="Active membership" tone="success" />
                <View style={{ rowGap: space.px }}>
                  <AppText step="caption" tone="muted">
                    Member number
                  </AppText>
                  <AppText step="title" family="mono">
                    {me.activeMembership.memberNumber}
                  </AppText>
                </View>
                <AppText step="bodySm" tone="muted">
                  {`${me.activeMembership.membershipType} membership, valid until ${formatDateTimeShort(
                    me.activeMembership.expiresAt,
                  )}`}
                </AppText>
              </View>
            ) : (
              <View style={{ rowGap: space[2] }}>
                <Badge label="No active membership" tone="warning" />
                <AppText step="bodySm" tone="muted">
                  The public price applies. Membership is not something this prototype sells.
                </AppText>
              </View>
            )}
          </View>
        </Card>

        {/* What is next. */}
        <View style={{ rowGap: space[3] }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              columnGap: space[3],
            }}
          >
            <AppText step="heading">Coming up</AppText>
            <Button
              label="All events"
              onPress={() => router.push("/events")}
              variant="quiet"
              size="md"
              icon={ArrowRight}
              iconSide="trailing"
            />
          </View>

          {state.status === "loading" ? (
            <EventCardSkeleton />
          ) : state.status === "error" ? (
            <ErrorState
              title="Events could not be loaded"
              body={state.error?.message ?? "The committee portal did not answer."}
              onRetry={state.reload}
            />
          ) : nextEvents.length === 0 ? (
            <Card surface={theme.surface.sunken} padding={5}>
              <View style={{ rowGap: space[2], alignItems: "flex-start" }}>
                <Icon icon={CalendarDays} size="lg" tone="muted" />
                <AppText step="title">Nothing upcoming</AppText>
                <AppText step="bodySm" tone="muted">
                  Every published event has already happened. Past events are still readable in the
                  events tab.
                </AppText>
                <Button
                  label="Open events"
                  onPress={() => router.push("/events")}
                  variant="secondary"
                  size="md"
                />
              </View>
            </Card>
          ) : (
            <View style={{ rowGap: space[3] }}>
              {nextEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  now={now}
                  onPress={() => router.push({ pathname: "/event/[id]", params: { id: event.id } })}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
