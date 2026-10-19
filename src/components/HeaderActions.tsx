import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNight } from "../services/theme";

export function HeaderActions({
  unread,
  onInbox,
  onProfile,
}: {
  unread: number;
  onInbox: () => void;
  onProfile: () => void;
}) {
  const night = useNight();
  const ink = night ? "#F4F6FB" : "#101828";
  return (
    <View className="ml-1 flex-row items-center">
      <Pressable
        onPress={onInbox}
        accessibilityRole="button"
        accessibilityLabel="Xabarlar"
        className="h-10 w-10 items-center justify-center"
      >
        <Ionicons name="notifications-outline" size={22} color={ink} />
        {unread > 0 ? (
          <View className="absolute right-1 top-1 min-w-[16px] items-center rounded-full bg-[#F04438] px-1">
            <Text className="text-[10px] font-bold text-white">{unread > 9 ? "9+" : String(unread)}</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        onPress={onProfile}
        accessibilityRole="button"
        accessibilityLabel="Profil"
        className="h-10 w-10 items-center justify-center"
      >
        <Ionicons name="person-circle-outline" size={24} color={ink} />
      </Pressable>
    </View>
  );
}
