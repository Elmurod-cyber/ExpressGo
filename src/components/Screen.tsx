import { ReactNode, Ref } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cssInterop } from "nativewind";

cssInterop(SafeAreaView, { className: "style" });

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  scrollRef?: Ref<ScrollView>;
  compact?: boolean;
  surface?: string;
};

export function Screen({ children, scroll = true, footer, scrollRef, compact = false, surface = "bg-canvas" }: ScreenProps) {
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
        </ScrollView>
      ) : (
        <View className="flex-1">
          <View className={compact ? "" : "flex-1"}>{children}</View>
        </View>
      )}
      {footer}
    </SafeAreaView>
  );
}
