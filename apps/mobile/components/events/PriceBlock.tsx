/**
 * Both prices, always, side by side.
 *
 * An event has a member price and a public price and they are different
 * numbers; showing one of them is how a student turns up expecting the wrong
 * amount. Both are facts about the event and both are rendered as such.
 *
 * WHICH ONE APPLIES is not decided here. Contract section 2: member pricing is
 * derived from an active membership period at registration time, inside the
 * database, and never from a role or from anything a client computes. This
 * component only reflects what `GET /api/me` reported, and says in words that
 * the server is the referee.
 */
import { formatEur, type Cents } from "@csa/domain";
import { radius, space } from "@csa/design-tokens";
import { View } from "react-native";

import { useTheme } from "@/lib/theme";
import { AppText } from "@/components/ui/AppText";
import { Badge } from "@/components/ui/Badge";
import { SurfaceProvider } from "@/components/ui/Surface";

export type ViewerPricing = "member" | "public" | "unknown";

export interface PriceBlockProps {
  memberCents: Cents;
  publicCents: Cents;
  /** `unknown` for a guest — nobody has told us which price applies. */
  viewer: ViewerPricing;
}

function priceText(cents: Cents): string {
  return formatEur(cents, { zeroLabel: "Free" });
}

/** The one-line form for a list row. */
export function PriceLine({ memberCents, publicCents }: Omit<PriceBlockProps, "viewer">) {
  if (memberCents === publicCents) {
    return (
      <AppText step="bodySm" weight={600} numeric>
        {priceText(memberCents)}
        <AppText step="bodySm" tone="muted">
          {"  members and public"}
        </AppText>
      </AppText>
    );
  }
  return (
    <AppText step="bodySm" numeric>
      <AppText step="bodySm" weight={600}>
        {priceText(memberCents)}
      </AppText>
      <AppText step="bodySm" tone="muted">
        {"  members  ·  "}
      </AppText>
      <AppText step="bodySm" weight={600}>
        {priceText(publicCents)}
      </AppText>
      <AppText step="bodySm" tone="muted">
        {"  public"}
      </AppText>
    </AppText>
  );
}

/** The detail-screen form: two columns, each labelled, with the applicable one marked. */
export function PriceBlock({ memberCents, publicCents, viewer }: PriceBlockProps) {
  const theme = useTheme();

  const columns = [
    { key: "member" as const, label: "Member price", cents: memberCents },
    { key: "public" as const, label: "Public price", cents: publicCents },
  ];

  return (
    <View style={{ rowGap: space[3] }}>
      <View style={{ flexDirection: "row", columnGap: space[3] }}>
        {columns.map((column) => {
          const applies = viewer === column.key;
          const surface = applies ? theme.brand.subtle : theme.surface.sunken;
          return (
            <SurfaceProvider key={column.key} surface={surface}>
              <View
                style={{
                  flex: 1,
                  rowGap: space[1],
                  padding: space[4],
                  borderRadius: radius.card,
                  backgroundColor: surface.ground,
                  borderWidth: 1,
                  borderColor: applies ? surface.outline : surface.hairline,
                }}
              >
                <AppText step="caption" tone="muted">
                  {column.label}
                </AppText>
                <AppText step="heading" numeric>
                  {priceText(column.cents)}
                </AppText>
                {applies ? <Badge label="Applies to you" tone="brand" withIcon={false} /> : null}
              </View>
            </SurfaceProvider>
          );
        })}
      </View>
      <AppText step="caption" tone="muted">
        {viewer === "unknown"
          ? "Sign in to see which of these applies to you. Either way, the price is resolved on the server from your membership at the moment you register."
          : "The price is resolved on the server from your membership at the moment you register, not by this screen."}
      </AppText>
    </View>
  );
}
