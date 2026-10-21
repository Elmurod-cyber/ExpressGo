import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "../context/Session";
import { useNight } from "../services/theme";

export type CityTab = "home" | "orders" | "profile";
export type CityBarTab = CityTab | "chat";

const items: {
  id: CityBarTab;
  icon: "home" | "receipt" | "chatbubble-ellipses" | "person";
  iconOff: "home-outline" | "receipt-outline" | "chatbubble-ellipses-outline" | "person-outline";
  label: string;
}[] = [
  { id: "home", icon: "home", iconOff: "home-outline", label: "nav.city_home" },
  { id: "orders", icon: "receipt", iconOff: "receipt-outline", label: "nav.jobs" },
  { id: "chat", icon: "chatbubble-ellipses", iconOff: "chatbubble-ellipses-outline", label: "nav.chat" },
  { id: "profile", icon: "person", iconOff: "person-outline", label: "nav.profile" },
];

export function CityTabBar({
  tab,
  onChange,
  chat = false,
  unread = 0,
}: {
  tab: CityBarTab;
  onChange: (tab: CityBarTab) => void;
  chat?: boolean;
  unread?: number;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const night = useNight();
  return (
    <View
      className="flex-row border-t border-line bg-canvas px-2 pt-0.5"
      style={{ paddingBottom: Math.max(insets.bottom, 4) }}
    >
      {items.filter((item) => chat || item.id !== "chat").map((item) => {
        const selected = tab === item.id;
        const color = selected ? "#FF8A00" : night ? "#A3A3A3" : "#667085";
        return (
          <Pressable
            key={item.id}
            onPress={() => onChange(item.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={t(item.label)}
            className="flex-1 items-center py-1"
          >
            <View>
              <Ionicons name={selected ? item.icon : item.iconOff} size={20} color={color} />
              {item.id === "chat" && unread > 0 ? (
                <View className="absolute -right-2 -top-1 min-w-[16px] items-center rounded-full bg-[#F04438] px-1">
                  <Text className="text-[10px] font-bold text-white">{unread > 9 ? "9+" : String(unread)}</Text>
                </View>
              ) : null}
            </View>
            <Text className="mt-0.5 text-[10px] font-semibold" style={{ color }} numberOfLines={1}>
              {t(item.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
