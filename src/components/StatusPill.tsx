import { Text, View } from "react-native";
import type { OrderStatus } from "../types";
import { useT } from "../context/Session";
import { statusTone } from "./orderStatus";

export function StatusPill({ status }: { status: OrderStatus }) {
  const t = useT();
  const tone = statusTone[status];
  return (
    <View className={`self-start rounded-full px-3 py-1 ${tone.wrap}`}>
      <Text className={`text-xs font-semibold ${tone.text}`}>{t(`status.${status}`)}</Text>
    </View>
  );
}
