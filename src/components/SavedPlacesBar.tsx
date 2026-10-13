import { Alert, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { SavedAddresses, SavedPlace, SavedSlot } from "../types";
import { useT } from "../context/Session";

type SavedPlacesBarProps = {
  places: SavedAddresses;
  onApply: (slot: SavedSlot, place: SavedPlace) => void;
  onSave: (slot: SavedSlot) => void;
  onClear: (slot: SavedSlot) => void;
};

export function SavedPlacesBar({ places, onApply, onSave, onClear }: SavedPlacesBarProps) {
  const t = useT();
  const slots: { slot: SavedSlot; title: string; icon: "home-outline" | "storefront-outline" }[] = [
    { slot: "home", title: t("saved.home"), icon: "home-outline" },
    { slot: "shop", title: t("saved.shop"), icon: "storefront-outline" },
  ];

  function onPress(slot: SavedSlot) {
    const place = places[slot];
    if (place) onApply(slot, place);
    else onSave(slot);
  }

  function onLongPress(slot: SavedSlot) {
    const meta = slots.find((item) => item.slot === slot);
    const place = places[slot];
    if (!place || !meta) {
      onSave(slot);
      return;
    }
    Alert.alert(meta.title, place.label, [
      { text: t("cancel"), style: "cancel" },
      { text: t("saved.delete"), style: "destructive", onPress: () => onClear(slot) },
      { text: t("saved.update"), onPress: () => onSave(slot) },
    ]);
  }

  return (
    <View className="mt-3">
      <Text className="text-xs text-muted">{t("saved.title")}</Text>
      <View className="mt-2 flex-row">
        {slots.map((item) => {
          const place = places[item.slot];
          const filled = Boolean(place);
          return (
            <Pressable
              key={item.slot}
              onPress={() => onPress(item.slot)}
              onLongPress={() => onLongPress(item.slot)}
              delayLongPress={380}
              accessibilityRole="button"
              accessibilityLabel={filled ? `${item.title}: ${place?.label}` : t("saved.add", { name: item.title })}
              className={`mr-2 min-w-[118px] flex-1 flex-row items-center rounded-2xl border px-3 py-2.5 ${
                filled ? "border-[#121212] bg-[#121212]" : "border-slate-200 bg-slate-50"
              }`}
            >
              <Ionicons name={item.icon} size={16} color={filled ? "#1290F9" : "#667085"} />
              <View className="ml-2 flex-1">
                <Text className={`text-xs font-semibold ${filled ? "text-white" : "text-ink"}`}>
                  {filled ? item.title : t("saved.add", { name: item.title })}
                </Text>
                <Text numberOfLines={1} className={`mt-0.5 text-[11px] ${filled ? "text-white/70" : "text-muted"}`}>
                  {place?.label ?? t("saved.hold")}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
