import { useEffect, useRef, type ReactNode } from "react";
import { Animated } from "react-native";

/** Yangi oyna qisqa siljish bilan kiradi. Hisob-kitob qatlamida emas. */
export function ScreenEnter({ children }: { children: ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [progress]);

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: progress,
        transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}
