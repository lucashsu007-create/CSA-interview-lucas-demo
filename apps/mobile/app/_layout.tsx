/**
 * The root of the app: fonts, safe areas, session, and the navigation stack.
 *
 * FONTS. `@csa/design-tokens/native` documents that React Native on Android will
 * not synthesise a weight out of a family — `{ fontFamily: 'Poppins',
 * fontWeight: '600' }` silently renders regular — so every weight has to be
 * registered as its own family, under exactly the names `nativeFontFamily()`
 * produces. That is what the `useFonts` map below is: the four Poppins weights
 * and the four JetBrains Mono weights, keyed by the names the token package will
 * ask for.
 *
 * The files come from `@expo-google-fonts/*`, imported ONE WEIGHT AT A TIME.
 * The package barrel re-exports all eighteen weights with `require()`, which
 * Metro cannot tree-shake — importing it pulls 3 MB of unused fonts into the
 * bundle. The per-weight subpaths pull eight files. The package ships the `.ttf`
 * inside itself, Metro bundles them into the app. NOTHING IS FETCHED AT
 * RUNTIME — no CDN, no fonts.googleapis.com, no remote subresource anywhere.
 * That is a privacy property of a system that holds member records, not a style
 * preference, and it is why the typeface is taken from the source site while its
 * delivery mechanism is left behind.
 */
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono/400Regular";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { JetBrainsMono_600SemiBold } from "@expo-google-fonts/jetbrains-mono/600SemiBold";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono/700Bold";
import { Poppins_400Regular } from "@expo-google-fonts/poppins/400Regular";
import { Poppins_500Medium } from "@expo-google-fonts/poppins/500Medium";
import { Poppins_600SemiBold } from "@expo-google-fonts/poppins/600SemiBold";
import { Poppins_700Bold } from "@expo-google-fonts/poppins/700Bold";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionProvider } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function RootLayout() {
  const theme = useTheme();
  const [fontsLoaded] = useFonts({
    "Poppins-Regular": Poppins_400Regular,
    "Poppins-Medium": Poppins_500Medium,
    "Poppins-SemiBold": Poppins_600SemiBold,
    "Poppins-Bold": Poppins_700Bold,
    "JetBrainsMono-Regular": JetBrainsMono_400Regular,
    "JetBrainsMono-Medium": JetBrainsMono_500Medium,
    "JetBrainsMono-SemiBold": JetBrainsMono_600SemiBold,
    "JetBrainsMono-Bold": JetBrainsMono_700Bold,
  });

  return (
    <SafeAreaProvider>
      <StatusBar style={theme.name === "dark" ? "light" : "dark"} />
      {/* A themed ground rather than `null` while the fonts register: a blank
          white flash between the splash and the first screen is a visible defect
          in dark mode, and it costs one View to avoid. */}
      {!fontsLoaded ? (
        <View style={{ flex: 1, backgroundColor: theme.surface.app.ground }} />
      ) : (
        <SessionProvider>
          <Stack
            screenOptions={{
              // Every screen renders its own header, so titles come from the
              // type scale like every other string in the app.
              headerShown: false,
              contentStyle: { backgroundColor: theme.surface.app.ground },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="event/[id]" options={{ animation: "slide_from_right" }} />
            <Stack.Screen name="+not-found" />
          </Stack>
        </SessionProvider>
      )}
    </SafeAreaProvider>
  );
}
