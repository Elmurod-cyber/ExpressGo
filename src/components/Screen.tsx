import { ReactNode, Ref } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cssInterop } from "nativewind";
import { AdBanner } from "./AdBanner";
import type { AdSlot } from "../types";

cssInterop(SafeAreaView, { className: "style" });

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  ad?: AdSlot | null;
  footer?: ReactNode;
  scrollRef?: Ref<ScrollView>;
  compact?: boolean;
  surface?: string;
};

export function Screen({ children, scroll = true, ad = "kitchen", footer, scrollRef, compact = false, surface = "bg-canvas" }: ScreenProps) {
  const banner = ad ? (
    <View className={`px-5 pb-6 ${compact ? "pt-1" : "pt-8"}`}>
      <AdBanner id={ad} />
    </View>
  ) : null;

  return (
    <SafeAreaView className={`flex-1 ${surface}`} edges={["top"]}>
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className={compact ? "" : "flex-1"}>{children}</View>
          {banner}
        </ScrollView>
      ) : (
        <View className="flex-1">
          <View className={compact ? "" : "flex-1"}>{children}</View>
          {banner}
        </View>
      )}
      {footer}
    </SafeAreaView>
  );
}
