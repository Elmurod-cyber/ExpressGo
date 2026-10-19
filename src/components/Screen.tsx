import { ReactNode, Ref, useEffect, useRef } from "react";
import { Keyboard, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cssInterop } from "nativewind";
import { keyboardFrameTop, liftAboveKeyboard, useKeyboardOverlap } from "../services/keyboardInset";

cssInterop(SafeAreaView, { className: "style" });

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  scrollRef?: Ref<ScrollView>;
  onScrollOffset?: (y: number) => void;
  compact?: boolean;
  surface?: string;
  keyboardInsets?: boolean;
};

export function Screen({ children, scroll = true, footer, scrollRef, onScrollOffset, compact = false, surface = "bg-canvas", keyboardInsets = true }: ScreenProps) {
  const overlap = useKeyboardOverlap();
  const innerRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  useEffect(() => {
    if (!scroll || !keyboardInsets) return;
    let first: ReturnType<typeof setTimeout> | undefined;
    let again: ReturnType<typeof setTimeout> | undefined;
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      const top = keyboardFrameTop(event);
      const run = () => liftAboveKeyboard(innerRef.current, scrollY.current, top, 96);
      clearTimeout(first);
      clearTimeout(again);
      first = setTimeout(run, 80);
      again = setTimeout(run, 320);
    });
    return () => {
      clearTimeout(first);
      clearTimeout(again);
      show.remove();
    };
  }, [keyboardInsets, scroll]);
  return (
    <SafeAreaView className={`flex-1 ${surface}`} edges={["top"]}>
      {scroll ? (
        <ScrollView
          ref={(node) => {
            innerRef.current = node;
            if (typeof scrollRef === "function") scrollRef(node);
            else if (scrollRef) scrollRef.current = node;
          }}
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, paddingBottom: keyboardInsets ? overlap : 0 }}
          keyboardShouldPersistTaps="handled"
          onScroll={(event) => {
            const y = event.nativeEvent.contentOffset.y;
            scrollY.current = y;
            onScrollOffset?.(y);
          }}
          scrollEventThrottle={16}
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
