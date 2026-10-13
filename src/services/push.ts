import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import { AppState, Platform } from "react-native";
import { drainRemotePushes, requeueRemotePushes, setPushToken } from "../server/store";
import { getApiUrl } from "./endpoint";
import { postRpc } from "./rpcCall";
import { getSessionToken } from "./sessionToken";

const CHANNEL = "express-go";

type NotificationsModule = typeof import("expo-notifications");

function loadNotifications(): NotificationsModule | null {
  if (isRunningInExpoGo()) return null;
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  const loaded = require("expo-notifications") as NotificationsModule & { default?: NotificationsModule };
  return typeof loaded.setNotificationHandler === "function" ? loaded : (loaded.default ?? null);
}

const Notifications = loadNotifications();

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const active = AppState.currentState === "active";
      return {
        shouldPlaySound: !active,
        shouldSetBadge: false,
        shouldShowBanner: !active,
        shouldShowList: true,
      };
    },
  });
}

let allowed = false;

export function pushSupported() {
  return Notifications !== null;
}

export async function preparePush(userId?: string | null): Promise<boolean> {
  if (!Notifications) {
    allowed = false;
    return false;
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Express Go",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#155EEF",
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const next = await Notifications.requestPermissionsAsync();
    status = next.status;
  }
  allowed = status === "granted";
  if (allowed && userId) await saveExpoToken(userId);
  return allowed;
}

async function saveExpoToken(userId: string) {
  if (!Notifications) return;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token.data) return;
    const base = getApiUrl();
    if (base) await postRpc(base, "setPushToken", [userId, token.data], getSessionToken(), "Push saqlanmadi.");
    else setPushToken(userId, token.data);
  } catch {
    // Qurilma ilovasida token keyinroq olinadi.
  }
}

export async function flushRemotePushes() {
  const batch = drainRemotePushes();
  if (!batch.length) return;
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        batch.map((item) => ({
          to: item.to,
          title: item.title,
          body: item.body,
          sound: "default",
        })),
      ),
    });
    if (!res.ok) requeueRemotePushes(batch);
  } catch {
    requeueRemotePushes(batch);
  }
}

export async function notifyLocal(title: string, body: string) {
  if (!Notifications || !allowed) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      ...(Platform.OS === "android" ? { channelId: CHANNEL } : {}),
    },
    trigger: null,
  });
}
