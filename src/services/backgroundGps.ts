import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { hydrateApp } from "../server/persist";
import { t } from "../i18n";
import { api } from "./api";

const TASK = "expressgo-courier-gps";
const COURIER_KEY = "expressgo.v1.bgCourier";

export type BackgroundGps = "on" | "denied" | "unsupported";

type TaskData = { locations?: Location.LocationObject[] };

/** Global darajada bo'lishi shart: fonda ilova ekransiz ko'tariladi. */
if (Platform.OS === "ios" || Platform.OS === "android") {
  TaskManager.defineTask<TaskData>(TASK, async ({ data, error, executionInfo }) => {
    if (error || executionInfo.appState === "active") return;
    const last = data?.locations?.[data.locations.length - 1];
    if (!last) return;
    try {
      await hydrateApp();
      const courierId = await AsyncStorage.getItem(COURIER_KEY);
      if (!courierId) return;
      await api.pingLocation(courierId, last.coords.latitude, last.coords.longitude);
    } catch {
      // Keyingi joylashuvda qayta urinadi.
    }
  });
}

export async function startBackgroundGps(courierId: string): Promise<BackgroundGps> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return "unsupported";
  try {
    if (!(await TaskManager.isAvailableAsync())) return "unsupported";
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") return "denied";
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== "granted") return "denied";

    await AsyncStorage.setItem(COURIER_KEY, courierId);
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) return "on";
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 20_000,
      distanceInterval: 50,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: t("gps.bg_title"),
        notificationBody: t("gps.bg_body"),
        notificationColor: "#155EEF",
        killServiceOnDestroy: false,
      },
    });
    return "on";
  } catch {
    // Expo Go iOS fon rejimini qo'llamaydi.
    return "unsupported";
  }
}

export async function stopBackgroundGps() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  try {
    await AsyncStorage.removeItem(COURIER_KEY);
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) {
      await Location.stopLocationUpdatesAsync(TASK);
    }
  } catch {
    // Task ro'yxatda yo'q.
  }
}
