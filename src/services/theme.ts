import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme, useColorScheme } from "nativewind";

export type ThemeMode = "day" | "night";

const KEY = "expressgo.v1.theme";

colorScheme.set("dark");

export function applyTheme(mode: ThemeMode) {
  colorScheme.set(mode === "day" ? "light" : "dark");
}

export async function loadTheme(): Promise<ThemeMode> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const mode: ThemeMode = raw === "day" ? "day" : "night";
    applyTheme(mode);
    return mode;
  } catch {
    applyTheme("night");
    return "night";
  }
}

export async function saveTheme(mode: ThemeMode): Promise<void> {
  applyTheme(mode);
  await AsyncStorage.setItem(KEY, mode);
}

export function useNight(): boolean {
  const { colorScheme: current } = useColorScheme();
  return current !== "light";
}
