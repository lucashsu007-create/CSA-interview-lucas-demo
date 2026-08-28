/**
 * The three Wave 1 tabs.
 *
 * Three, because there are three things a member does in this wave: see what is
 * next, browse events, and decide who they are. A fourth tab holding a screen
 * that does not exist yet would be furniture.
 *
 * The tab bar is themed from tokens end to end — ground, hairline, active and
 * inactive ink, and the label's type step. React Navigation's own defaults would
 * otherwise put a system blue and a system font into the one piece of chrome
 * that is visible on every screen.
 */
import { space } from "@csa/design-tokens";
import { textStyle } from "@csa/design-tokens/native";
import { Tabs } from "expo-router";
import { CalendarDays, House, UserRound } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/lib/theme";

/**
 * The tab bar's own content height, before the home indicator.
 *
 * The navigator's default is 48, which leaves the label a 10pt slot once the
 * icon and the item padding are taken out — and the caption step's line height
 * is 16, so every label was clipped. 56 gives it 18.
 *
 * The inset has to be added by hand: a numeric `height` in `tabBarStyle`
 * REPLACES the navigator's computed total rather than being added to it, and the
 * navigator then applies `paddingBottom: insets.bottom` INSIDE that height. Set
 * it to a bare 56 and the labels move into the home indicator on every phone
 * that has one.
 */
const TAB_BAR_CONTENT_HEIGHT = space[14];

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const label = textStyle("caption");

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.surface.app.ground },
        tabBarActiveTintColor: theme.brand.mark,
        tabBarInactiveTintColor: theme.surface.card.inkMuted,
        tabBarStyle: {
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          backgroundColor: theme.surface.card.ground,
          borderTopColor: theme.surface.card.hairline,
          borderTopWidth: 1,
        },
        // The step is handed over whole — including its line height. Passing the
        // size without it lets the label box grow to the font's natural line
        // box, and the descenders get clipped by the tab bar.
        tabBarLabelStyle: {
          fontFamily: label.fontFamily,
          fontSize: label.fontSize,
          lineHeight: label.lineHeight,
          letterSpacing: label.letterSpacing,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <House size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ color, size }) => (
            <CalendarDays size={size} color={color} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="identity"
        options={{
          title: "Identity",
          tabBarIcon: ({ color, size }) => <UserRound size={size} color={color} strokeWidth={2} />,
        }}
      />
    </Tabs>
  );
}
