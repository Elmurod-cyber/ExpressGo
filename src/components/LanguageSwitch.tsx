import { Pressable, Text, View } from "react-native";
import { useSession } from "../context/Session";
import { LANGUAGE_SWITCH_ENABLED, type Locale } from "../i18n";

export function LanguageSwitch({ light = false, flush = false, compact = false }: { light?: boolean; flush?: boolean; compact?: boolean }) {
  const { locale, setLocale } = useSession();
  if (!LANGUAGE_SWITCH_ENABLED) return null;
  return (
    <View className={`flex-row overflow-hidden rounded-full ${flush ? "" : "self-end"} ${light ? "bg-white/15" : "bg-slate-100"}`}>
      <LangChip code="uz" label="UZ" selected={locale === "uz"} light={light} compact={compact} onPress={() => setLocale("uz")} />
      <LangChip code="ru" label="RU" selected={locale === "ru"} light={light} compact={compact} onPress={() => setLocale("ru")} />
    </View>
  );
}

function LangChip({
  code,
  label,
  selected,
  light,
  compact,
  onPress,
}: {
  code: Locale;
  label: string;
  selected: boolean;
  light: boolean;
  compact: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={code === "uz" ? "O'zbekcha" : "Русский"}
      className={`${compact ? "px-2 py-0.5" : "px-3 py-1.5"} ${selected ? (light ? "bg-white" : "bg-[#121212]") : ""}`}
    >
      <Text className={`${compact ? "text-[10px]" : "text-xs"} font-bold ${selected ? (light ? "text-[#171717]" : "text-white") : light ? "text-white/70" : "text-muted"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
