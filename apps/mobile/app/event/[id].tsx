/**
 * One event, in full.
 *
 * The four facts a student actually needs before deciding — when, where, how
 * many places, and by when — plus BOTH prices, because an event has two and
 * showing one is how somebody turns up with the wrong amount.
 *
 * Nothing on this screen decides a business rule. Whether registration is open
 * comes from `@csa/domain`'s own predicate, which reproduces the database
 * boundary exactly; whether a place remains is the server's call under a row
 * lock; which price applies is resolved inside `register_for_event` from the
 * membership period at that instant. The screen reports and the server rules.
 */
import { size, space, typeScale } from "@csa/design-tokens";
import { stateOpacity } from "@csa/design-tokens/native";
import { REGISTRATION_ERROR_MESSAGES, isRegistrationOpen } from "@csa/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarDays, ChevronLeft, Clock, MapPin, Ticket, Users } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { EventStatusBadge } from "@/components/events/EventStatusBadge";
import { PriceBlock, type ViewerPricing } from "@/components/events/PriceBlock";
import { AppText } from "@/components/ui/AppText";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { MetaRow } from "@/components/ui/MetaRow";
import { Screen, useScrollBottomPadding } from "@/components/ui/Screen";
import { ErrorState, SkeletonBlock } from "@/components/ui/States";
import {
  ApiError,
  getEvent,
  registerForEvent,
  type EventDetail,
  type RegistrationSummary,
} from "@/lib/api";
import {
  categoryLabel,
  formatDateTimeLong,
  formatDateTimeShort,
  formatRelative,
} from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useAsync } from "@/lib/useAsync";

const GUTTER = space[4];

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { status: sessionStatus, token, me, refresh } = useSession();
  const bottomPadding = useScrollBottomPadding(6);

  const load = useCallback((signal: AbortSignal) => getEvent(id, { token, signal }), [id, token]);
  const state = useAsync(load, [id, token]);
  const now = useMemo(() => new Date(), [state.data]);

  /**
   * The registration outcome lives HERE, not in `EventBody`.
   *
   * Registering re-reads the event so the capacity line is current, and a
   * re-read that went through the loading branch would unmount the body and
   * take the confirmation down with it — the member would tap Register, see a
   * skeleton, and land back on an un-registered-looking screen holding a real
   * ticket. `refresh` keeps the rendered data in place while it re-reads, and
   * the outcome sits above the branch either way.
   */
  const [ticket, setTicket] = useState<RegistrationSummary | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const viewer: ViewerPricing =
    sessionStatus !== "signed-in" ? "unknown" : me?.activeMembership ? "member" : "public";

  return (
    <Screen>
      <Header onBack={() => (router.canGoBack() ? router.back() : router.replace("/events"))} />
      <ScrollView
        contentContainerStyle={{ padding: GUTTER, paddingBottom: bottomPadding, rowGap: space[5] }}
      >
        {state.status === "loading" ? (
          <DetailSkeleton />
        ) : state.status === "error" || !state.data ? (
          <ErrorState
            title="This event could not be loaded"
            body={state.error?.message ?? "The committee portal did not answer."}
            onRetry={state.reload}
          />
        ) : (
          <EventBody
            event={state.data}
            now={now}
            viewer={viewer}
            canRegister={sessionStatus === "signed-in" && token !== null}
            token={token}
            ticket={ticket}
            failure={failure}
            onResult={(result) => {
              setTicket(result.ticket);
              setFailure(result.failure);
              if (result.ticket) {
                state.refresh();
                void refresh();
              }
            }}
            onSignIn={() => router.push("/identity")}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={{ paddingHorizontal: space[2], paddingVertical: space[2] }}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        // No hitSlop: the row already renders at the touch floor. hitSlop is for
        // artwork smaller than the floor, not a second belt on a control that
        // already clears it.
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          columnGap: space[1],
          minHeight: size.touchTarget.min,
          paddingHorizontal: space[2],
          alignSelf: "flex-start",
          opacity: stateOpacity({ pressed }),
        })}
      >
        <Icon icon={ChevronLeft} size="lg" />
        <AppText step="body" weight={600}>
          Back
        </AppText>
      </Pressable>
    </View>
  );
}

function EventBody({
  event,
  now,
  viewer,
  canRegister,
  token,
  ticket,
  failure,
  onResult,
  onSignIn,
}: {
  event: EventDetail;
  now: Date;
  viewer: ViewerPricing;
  canRegister: boolean;
  token: string | null;
  ticket: RegistrationSummary | null;
  failure: string | null;
  onResult: (result: { ticket: RegistrationSummary | null; failure: string | null }) => void;
  onSignIn: () => void;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  const open = isRegistrationOpen(
    { status: event.status, registrationDeadlineAt: event.registrationDeadlineAt },
    now,
  );
  const deadlineRelative = formatRelative(event.registrationDeadlineAt, now);

  const capacityValue =
    event.spotsRemaining === null
      ? `${event.capacity} places`
      : `${event.spotsRemaining} of ${event.capacity} left`;
  const capacityNote =
    event.spotsRemaining === null
      ? "Places remaining were not reported by this endpoint, so none are shown. The server counts them under a row lock when you register."
      : event.registeredCount === null
        ? undefined
        : `${event.registeredCount} registered so far.`;

  const register = async () => {
    if (!token) return;
    setBusy(true);
    onResult({ ticket: null, failure: null });
    try {
      const result = await registerForEvent(event.id, token);
      onResult({ ticket: result, failure: null });
    } catch (caught) {
      onResult({ ticket: null, failure: registrationFailureText(caught) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={{ rowGap: space[3] }}>
        <View style={{ flexDirection: "row", columnGap: space[2], flexWrap: "wrap" }}>
          <Badge label={categoryLabel(event.category)} tone="neutral" />
          <EventStatusBadge
            status={event.status}
            registrationDeadlineAt={event.registrationDeadlineAt}
            startsAt={event.startsAt}
            now={now}
          />
        </View>
        <AppText step="display">{event.title}</AppText>
        <AppText step="bodyLg" tone="muted">
          {event.description}
        </AppText>
      </View>

      <Card padding={5}>
        <View style={{ rowGap: space[4] }}>
          <MetaRow
            icon={CalendarDays}
            label="Starts"
            value={formatDateTimeLong(event.startsAt)}
            note={formatRelative(event.startsAt, now) ?? undefined}
            numeric
          />
          <MetaRow icon={MapPin} label="Location" value={event.location} />
          <MetaRow
            icon={Users}
            label="Capacity"
            value={capacityValue}
            note={capacityNote}
            numeric
          />
          <MetaRow
            icon={Clock}
            label="Registration deadline"
            value={formatDateTimeShort(event.registrationDeadlineAt)}
            note={deadlineRelative ?? undefined}
            numeric
          />
        </View>
      </Card>

      <View style={{ rowGap: space[3] }}>
        <AppText step="heading">Price</AppText>
        <PriceBlock
          memberCents={event.priceMemberCents}
          publicCents={event.pricePublicCents}
          viewer={viewer}
        />
      </View>

      {ticket ? (
        <Card surface={theme.status.success.subtle} padding={5}>
          <View
            style={{ rowGap: space[2] }}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Badge label="Registered" tone="success" variant="subtle" />
            <AppText step="title">You have a place</AppText>
            <View style={{ rowGap: space.px }}>
              <AppText step="caption" tone="muted">
                Ticket code
              </AppText>
              <AppText step="title" family="mono">
                {ticket.ticketCode}
              </AppText>
            </View>
            <AppText step="bodySm" tone="muted">
              {`Payment status: ${ticket.paymentStatus}. The server charged the ${
                ticket.isMemberPrice ? "member" : "public"
              } price. The scannable QR ticket is a later wave — this screen shows the code the server issued and nothing more.`}
            </AppText>
          </View>
        </Card>
      ) : failure ? (
        <ErrorState title="Registration was refused" body={failure} />
      ) : null}

      {!ticket ? (
        <View style={{ rowGap: space[2] }}>
          {!canRegister ? (
            <>
              <Button label="Choose an identity to register" onPress={onSignIn} icon={Ticket} />
              <AppText step="caption" tone="muted">
                Reading this page needs no identity. Registering does, because the server resolves
                your price from your membership.
              </AppText>
            </>
          ) : (
            <>
              <Button
                label={open ? "Register for this event" : "Registration is closed"}
                onPress={() => void register()}
                icon={Ticket}
                disabled={!open}
                busy={busy}
                accessibilityHint={
                  open
                    ? "The server checks capacity and your membership before confirming"
                    : "The deadline has passed or the event is not open"
                }
              />
              {!open ? (
                <AppText step="caption" tone="muted">
                  {event.status === "sold_out"
                    ? "Every place is taken. The server is the referee on capacity, so this is its answer, not a guess."
                    : `The deadline passed on ${formatDateTimeShort(event.registrationDeadlineAt)}.`}
                </AppText>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </>
  );
}

/**
 * The contract's error tokens, turned into sentences.
 *
 * `{ error: "event_full" }` travels in the body precisely so a client switches
 * on the token rather than parsing prose, and `@csa/domain` owns the copy for
 * the three tokens it defines. `already_registered` and `forbidden` are named in
 * the HTTP mapping (contract section 13) but are not in
 * `REGISTRATION_ERROR_CODES`, so their copy lives here.
 */
function registrationFailureText(caught: unknown): string {
  if (!(caught instanceof ApiError)) return "Something went wrong.";
  const known = caught.registrationCode;
  if (known) return REGISTRATION_ERROR_MESSAGES[known];
  if (caught.code === "already_registered") return "You already hold a place at this event.";
  if (caught.code === "forbidden") return "This identity is not allowed to register here.";
  return caught.message;
}

function DetailSkeleton() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ rowGap: space[5] }}
    >
      {/* Each block is the height of the thing it stands in for, read off the
          type scale, so nothing shifts when the real content lands. */}
      <View style={{ rowGap: space[3] }}>
        <SkeletonBlock height={typeScale.caption.lineHeight + space[2]} width="30%" />
        <SkeletonBlock height={typeScale.display.lineHeight} width="90%" />
        <SkeletonBlock height={typeScale.bodyLg.lineHeight * 2} />
      </View>
      <SkeletonBlock height={space[24] * 2 + space[7]} />
      <SkeletonBlock height={space[20] + space[14]} />
    </View>
  );
}
