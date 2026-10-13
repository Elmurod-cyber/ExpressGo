import { Text, View } from "react-native";
import { useT } from "../context/Session";

export function HistoryStats({ items }: { items: { label: string; value: string }[] }) {
  const t = useT();
  return (
    <View className="mb-3 rounded-3xl bg-white px-4 py-4">
      <Text className="text-base font-bold text-ink">{t("stats")}</Text>
      <View className="mt-3 flex-row flex-wrap">
        {items.map((item) => (
          <View key={item.label} className="mb-3 w-1/2 pr-2">
            <Text className="text-xs text-muted">{item.label}</Text>
            <Text className="mt-1 text-lg font-bold text-ink">{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
