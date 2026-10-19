import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "../context/Session";

export type SenderPage = "home" | "orders" | "chat" | "profile";

const items: {
  id: SenderPage;
  icon: "home" | "receipt" | "chatbubble-ellipses" | "person";
  iconOff: "home-outline" | "receipt-outline" | "chatbubble-ellipses-outline" | "person-outline";
  label: string;
}[] = [
  { id: "home", icon: "home", iconOff: "home-outline", label: "nav.home" },
  { id: "orders", icon: "receipt", iconOff: "receipt-outline", label: "nav.orders" },
  { id: "chat", icon: "chatbubble-ellipses", iconOff: "chatbubble-ellipses-outline", label: "nav.chat" },
  { id: "profile", icon: "person", iconOff: "person-outline", label: "nav.profile" },
];

export function SenderTabBar({
  page,
  unread,
  onChange,
}: {
  page: SenderPage;
  unread: number;
  onChange: (page: SenderPage) => void;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();
  return (
    <View className="flex-row border-t border-line bg-card px-1 pt-1" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
      {items.map((item) => {
        const selected = page === item.id;
        const color = selected ? "#1290F9" : "#98A2B3";
        return (
          <Pressable
            key={item.id}
            onPress={() => onChange(item.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className="flex-1 items-center py-1.5"
          >
            <View>
              <Ionicons name={selected ? item.icon : item.iconOff} size={22} color={color} />
              {item.id === "chat" && unread > 0 ? (
                <View className="absolute -right-2 -top-1 min-w-[16px] items-center rounded-full bg-[#F04438] px-1">
                  <Text className="text-[10px] font-bold text-white">{unread > 9 ? "9+" : String(unread)}</Text>
                </View>
              ) : null}
            </View>
            <Text className="mt-1 text-[11px] font-semibold" style={{ color }} numberOfLines={1}>
              {t(item.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
