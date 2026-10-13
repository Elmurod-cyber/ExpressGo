import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../context/Session";

export type AppDock = "sender" | "courier" | "admin";

export function AdminEntry() {
  const { account, setDock, t } = useSession();
  if (!account?.isAdmin) return null;
  return (
    <Pressable
      onPress={() => setDock("admin")}
      accessibilityRole="button"
      className="mt-3 flex-row items-center rounded-3xl bg-white px-3 py-2.5 active:opacity-90"
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-soft">
        <Ionicons name="grid" size={18} color="#155EEF" />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-sm font-semibold text-ink">{t("profile.admin")}</Text>
        <Text className="text-xs text-muted">{t("profile.admin_hint")}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#98A2B3" />
    </Pressable>
  );
}
