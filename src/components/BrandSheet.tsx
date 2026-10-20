import { useEffect, useRef, useState } from "react";
import { Animated, Linking, Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "../context/Session";
import { useNight } from "../services/theme";
import { BrandMark } from "./BrandMark";
import { ThemeSwitch } from "./ThemeSwitch";

const SUPPORT_TEL = "tel:+998902081155";
const SUPPORT_LABEL = "+998 (90) 208-11-55";

export function BrandSheet() {
  const t = useT();
  const night = useNight();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const version = Constants.expoConfig?.version ?? "1.0.0";

  useEffect(() => {
    if (!open) return;
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [open, progress]);

  function close() {
    Animated.timing(progress, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setOpen(false);
    });
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Express Go">
        <BrandMark size={52} />
      </Pressable>
      <Modal visible={open} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
        <Pressable onPress={close} accessibilityRole="button" style={{ flex: 1 }}>
          <Animated.View
            style={{
              marginTop: insets.top + 4,
              marginLeft: 76,
              opacity: progress,
              transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-36, 0] }) }],
            }}
          >
            <Pressable accessibilityRole="none" className="w-60 rounded-3xl bg-card px-4 py-3" style={{ elevation: 8 }}>
              <Pressable
                onPress={() => {
                  close();
                  void Linking.openURL(SUPPORT_TEL);
                }}
                accessibilityRole="button"
                className="flex-row items-center py-2"
              >
                <Ionicons name="call" size={18} color="#FF8A00" />
                <View className="ml-3 min-w-0 flex-1">
                  <Text className="text-sm font-bold text-ink">{t("brand.contact")}</Text>
                  <Text className="text-xs font-semibold text-muted">{SUPPORT_LABEL}</Text>
                </View>
              </Pressable>
              <View className={`my-1 h-px ${night ? "bg-white/10" : "bg-slate-100"}`} />
              <View className="py-2">
                <Text className="text-sm font-bold text-ink">{t("brand.about")}</Text>
                <Text className="text-xs font-semibold text-muted">Express Go · {t("brand.version", { version })}</Text>
              </View>
              <View className={`my-1 h-px ${night ? "bg-white/10" : "bg-slate-100"}`} />
              <View className="flex-row items-center justify-between py-2">
                <Text className="text-sm font-bold text-ink">{t("brand.theme")}</Text>
                <ThemeSwitch compact />
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}
