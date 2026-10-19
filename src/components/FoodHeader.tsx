import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useT } from "../context/Session";
import { useNight } from "../services/theme";

export function FoodHeader({
  title,
  onBack,
  cartCount,
  onCart,
}: {
  title: string;
  onBack: () => void;
  cartCount: number;
  onCart: () => void;
}) {
  const t = useT();
  const night = useNight();
  return (
    <View className="mb-3 flex-row items-center">
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t("food.back")} className="h-10 w-10 items-center justify-center">
        <Ionicons name="chevron-back" size={22} color="#155EEF" />
      </Pressable>
      <Text className="flex-1 text-center text-lg font-bold text-ink" numberOfLines={1}>
        {title}
      </Text>
      <Pressable
        onPress={onCart}
        accessibilityRole="button"
        accessibilityLabel={cartCount > 0 ? `${t("food.cart")}, ${cartCount}` : t("food.cart")}
        className="h-10 w-10 items-center justify-center"
      >
        <Ionicons name="cart-outline" size={26} color={night ? "#F4F6FB" : "#121212"} />
        {cartCount > 0 ? (
          <View className="absolute right-0 top-0 h-5 min-w-5 items-center justify-center rounded-full bg-[#C2410C] px-1">
            <Text className="text-[11px] font-bold text-white">{cartCount}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
