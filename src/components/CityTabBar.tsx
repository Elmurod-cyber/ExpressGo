import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "../context/Session";
import { useNight } from "../services/theme";

export type CityTab = "home" | "orders" | "profile";

const items: {
  id: CityTab;
  icon: "home" | "receipt" | "person";
  iconOff: "home-outline" | "receipt-outline" | "person-outline";
  label: string;
}[] = [
  { id: "home", icon: "home", iconOff: "home-outline", label: "nav.city_home" },
  { id: "orders", icon: "receipt", iconOff: "receipt-outline", label: "nav.jobs" },
  { id: "profile", icon: "person", iconOff: "person-outline", label: "nav.profile" },
];

export function CityTabBar({ tab, onChange }: { tab: CityTab; onChange: (tab: CityTab) => void }) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const night = useNight();
  return (
    <View
      className="flex-row border-t border-line bg-canvas px-2 pt-0.5"
      style={{ paddingBottom: Math.max(insets.bottom, 4) }}
    >
      {items.map((item) => {
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
            <Ionicons name={selected ? item.icon : item.iconOff} size={20} color={color} />
            <Text className="mt-0.5 text-[10px] font-semibold" style={{ color }} numberOfLines={1}>
              {t(item.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
