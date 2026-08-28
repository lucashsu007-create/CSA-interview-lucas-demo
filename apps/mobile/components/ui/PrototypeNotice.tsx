/**
 * "This is not the real thing."
 *
 * A standing rule of the repo: any demo surface states that it is a prototype
 * and not an official CSA product. It sits on the brand's subtle wash rather
 * than a warning ground, because it is a disclosure and not a fault.
 */
import { space } from "@csa/design-tokens";
import { FlaskConical } from "lucide-react-native";
import { View } from "react-native";

import { PROTOTYPE_NOTICE } from "@/lib/config";
import { useTheme } from "@/lib/theme";

import { AppText } from "./AppText";
import { Card } from "./Card";
import { Icon } from "./Icon";

export function PrototypeNotice() {
  const theme = useTheme();
  return (
    <Card surface={theme.brand.subtle} padding={3}>
      <View style={{ flexDirection: "row", columnGap: space[2], alignItems: "flex-start" }}>
        <Icon icon={FlaskConical} size="sm" />
        <AppText step="caption" style={{ flex: 1 }}>
          {PROTOTYPE_NOTICE}
        </AppText>
      </View>
    </Card>
  );
}
