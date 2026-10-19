import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme, useColorScheme, vars } from "nativewind";

export type ThemeMode = "day" | "night";

const KEY = "expressgo.v1.theme";

const dayColors = {
  "--eg-card": "255 255 255",
  "--eg-canvas": "244 246 251",
  "--eg-ink": "16 24 40",
  "--eg-muted": "102 112 133",
  "--eg-line": "230 234 242",
};

const nightColors = {
  "--eg-card": "36 36 36",
  "--eg-canvas": "23 23 23",
  "--eg-ink": "244 246 251",
  "--eg-muted": "163 163 163",
  "--eg-line": "58 58 58",
};

export const themeVars = {
  day: vars(dayColors),
  night: vars(nightColors),
};

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
