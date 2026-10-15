import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Alert, Platform } from "react-native";
import { t } from "../i18n";
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

function isLoudOffer(title: string | null, data: Record<string, unknown> | undefined): boolean {
  const orderId = data?.orderId;
  return (typeof orderId === "string" && orderId.length > 0) || title === "Yangi Buyurtma!";
}

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => ({
      // Ilova ochiq: taklif ovozi ekranda chaladi. Shu xabar ovozi qo'shilmasin.
      shouldPlaySound: !isLoudOffer(notification.request.content.title, notification.request.content.data),
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

const ORDER_CHANNEL = "order-alert";
const ORDER_SOUND = "order_alert";

async function ensureChannels() {
  if (!Notifications || Platform.OS !== "android") return;
  const pattern = [0, 250, 250, 250];
  await Notifications.setNotificationChannelAsync(ORDER_CHANNEL, {
    name: "Buyurtmalar bildirishnomasi",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: pattern,
    lightColor: "#FF231F7C",
    sound: ORDER_SOUND,
  });
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: "Express Go",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: pattern,
    lightColor: "#155EEF",
  });
}

let allowed = false;
let permissionTold = false;

export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  if (!Notifications || !Device.isDevice) return;

  await ensureChannels();
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  allowed = status === "granted";
  if (!allowed) {
    if (!permissionTold) {
      permissionTold = true;
      Alert.alert(t("push.denied"));
    }
    return;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;
  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data || undefined;
  } catch {
    return;
  }
}

export function pushSupported() {
  return Notifications !== null;
}

export async function preparePush(userId?: string | null): Promise<boolean> {
  const token = await registerForPushNotificationsAsync();
  if (token && userId) await saveExpoToken(userId, token);
  return allowed;
}

async function saveExpoToken(userId: string, token: string) {
  try {
    const base = getApiUrl();
    if (base) await postRpc(base, "setPushToken", [userId, token], getSessionToken(), "Push saqlanmadi.");
    else setPushToken(userId, token);
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
