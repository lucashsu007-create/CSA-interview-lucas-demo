/**
 * A route that does not exist — most likely a deep link to an event that was
 * removed. It says what happened and offers the one action that helps.
 */
import { space } from "@csa/design-tokens";
import { useRouter } from "expo-router";
import { Compass } from "lucide-react-native";
import { View } from "react-native";

import { Screen } from "@/components/ui/Screen";
import { EmptyState } from "@/components/ui/States";

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: space[4] }}>
        <EmptyState
          icon={Compass}
          title="That page is not here"
          body="The link points at something this app does not have."
          action={{ label: "Go to events", onPress: () => router.replace("/events") }}
        />
      </View>
    </Screen>
  );
}
