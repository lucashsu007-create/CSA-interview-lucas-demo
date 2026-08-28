/**
 * Choosing who the app is acting as.
 *
 * Not a login screen. There are no passwords and no magic links — contract
 * section 7 is explicit that `.local` addresses are undeliverable, so the demo
 * mints a session for a seeded identity instead. `POST /api/session` returns a
 * token, `expo-secure-store` keeps it, and every later call carries it as
 * `Authorization: Bearer`.
 *
 * The four rows below carry an address and a one-line description, both taken
 * from the contract. Names, roles and membership state are NOT written here:
 * they are read back from `GET /api/me` after the session exists, so this screen
 * can never disagree with the database about who someone is.
 */
import { radius, size, space } from "@csa/design-tokens";
import { hitSlopFor, stateOpacity } from "@csa/design-tokens/native";
import { ChevronRight, LogOut, ShieldCheck } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { PrototypeNotice } from "@/components/ui/PrototypeNotice";
import { Screen, useScrollBottomPadding } from "@/components/ui/Screen";
import { ErrorState } from "@/components/ui/States";
import { SurfaceProvider } from "@/components/ui/Surface";
import { DEMO_IDENTITIES } from "@/lib/config";
import { formatDateTimeShort } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

const GUTTER = space[4];

export default function IdentityScreen() {
  const theme = useTheme();
  const { status, me, busy, error, signIn, signOut } = useSession();
  const bottomPadding = useScrollBottomPadding();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: GUTTER, paddingBottom: bottomPadding, rowGap: space[5] }}
      >
        <View style={{ rowGap: space[1] }}>
          <AppText step="display">Identity</AppText>
          <AppText step="bodySm" tone="muted">
            Sessions are seeded rather than authenticated. Signing in is only needed to register for
            an event.
          </AppText>
        </View>

        <PrototypeNotice />

        {error ? <ErrorState title="Could not sign in" body={error} /> : null}

        {status === "signed-in" && me ? (
          <Card padding={5}>
            <View style={{ rowGap: space[4] }}>
              <View style={{ rowGap: space[1] }}>
                <AppText step="caption" tone="muted">
                  Signed in as
                </AppText>
                <AppText step="heading">{me.fullName}</AppText>
                <AppText step="bodySm" tone="muted" family="mono">
                  {me.email}
                </AppText>
              </View>

              <View style={{ flexDirection: "row", columnGap: space[2], flexWrap: "wrap" }}>
                <Badge label={`Role: ${me.role}`} tone="neutral" icon={ShieldCheck} />
                {me.activeMembership ? (
                  <Badge label="Active membership" tone="success" />
                ) : (
                  <Badge label="No active membership" tone="warning" />
                )}
              </View>

              {me.activeMembership ? (
                <View style={{ rowGap: space.px }}>
                  <AppText step="caption" tone="muted">
                    Member number
                  </AppText>
                  <AppText step="body" family="mono">
                    {me.activeMembership.memberNumber}
                  </AppText>
                  <AppText step="bodySm" tone="muted">
                    {`Valid until ${formatDateTimeShort(me.activeMembership.expiresAt)}`}
                  </AppText>
                </View>
              ) : (
                <AppText step="bodySm" tone="muted">
                  Role and membership are separate: an admin without a current membership still pays
                  the public price. The server decides that at the moment of registration.
                </AppText>
              )}

              <Button
                label="Sign out"
                onPress={() => void signOut()}
                variant="secondary"
                icon={LogOut}
                busy={busy}
                style={{ alignSelf: "flex-start" }}
              />
            </View>
          </Card>
        ) : (
          <View style={{ rowGap: space[3] }}>
            <AppText step="title">Demo identities</AppText>
            {DEMO_IDENTITIES.map((identity) => (
              <IdentityRow
                key={identity.email}
                email={identity.email}
                summary={identity.summary}
                disabled={busy || status === "restoring"}
                onPress={() => void signIn(identity.email)}
              />
            ))}
            <Card surface={theme.surface.sunken} padding={4}>
              <AppText step="bodySm" tone="muted">
                Staying a guest is a supported state. The events list and every event page are
                readable without an identity — the API returns published events to an
                unauthenticated caller by design.
              </AppText>
            </Card>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function IdentityRow({
  email,
  summary,
  disabled,
  onPress,
}: {
  email: string;
  summary: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const surface = theme.surface.card;

  return (
    <SurfaceProvider surface={surface}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Sign in as ${email}. ${summary}.`}
        accessibilityState={{ disabled }}
        hitSlop={hitSlopFor(size.control.lg)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          columnGap: space[3],
          minHeight: size.control.lg,
          padding: space[4],
          borderRadius: radius.card,
          backgroundColor: surface.ground,
          borderWidth: 1,
          borderColor: surface.hairline,
          opacity: stateOpacity({ pressed, disabled }),
        })}
      >
        <View style={{ flex: 1, rowGap: space.px }}>
          <AppText step="body" weight={600} family="mono">
            {email}
          </AppText>
          <AppText step="bodySm" tone="muted">
            {summary}
          </AppText>
        </View>
        {/* A forward affordance, not a tick: a check mark on a row that is not
            selected says the wrong thing. */}
        <Icon icon={ChevronRight} size="md" tone="muted" />
      </Pressable>
    </SurfaceProvider>
  );
}
