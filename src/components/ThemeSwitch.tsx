import { Pressable, Text, View } from "react-native";
import { useT } from "../context/Session";
import { saveTheme, useNight } from "../services/theme";

export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const night = useNight();
  const pad = compact ? "px-2 py-0.5" : "px-3 py-1.5";
  const size = compact ? "text-[10px]" : "text-xs";
  return (
    <View className={`flex-row overflow-hidden rounded-full ${night ? "bg-white/15" : "bg-slate-100"}`}>
      <Pressable
        onPress={() => void saveTheme("day")}
        accessibilityRole="button"
        accessibilityState={{ selected: !night }}
        accessibilityLabel={t("theme.day")}
        className={`${pad} ${night ? "" : "bg-[#121212]"}`}
      >
        <Text className={`${size} font-bold ${night ? "text-white/70" : "text-white"}`}>{t("theme.day")}</Text>
      </Pressable>
      <Pressable
        onPress={() => void saveTheme("night")}
        accessibilityRole="button"
        accessibilityState={{ selected: night }}
        accessibilityLabel={t("theme.night")}
        className={`${pad} ${night ? "bg-white" : ""}`}
      >
        <Text className={`${size} font-bold ${night ? "text-[#171717]" : "text-muted"}`}>{t("theme.night")}</Text>
      </Pressable>
    </View>
  );
}
