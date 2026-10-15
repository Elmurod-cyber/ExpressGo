import AsyncStorage from "@react-native-async-storage/async-storage";
import { exportSnapshot, importSnapshot } from "./store";
import { getLocale, setLocale, type Locale } from "../i18n";
import type { AppDock } from "../components/DemoDock";
import { CLOUD_API_URL, getApiUrl, setApiUrl } from "../services/endpoint";
import type { Account } from "../types";
import { startCloudSync } from "../services/cloud";

const STORE_KEY = "expressgo.v1.store";
const SESSION_KEY = "expressgo.v1.session";

export type SessionSnap = {
  accountId: string | null;
  account: Account | null;
  dock: AppDock;
  locale: Locale;
  pushOn: boolean;
  apiUrl: string;
  token: string | null;
};

let lastStore = "";
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let hydrating: Promise<SessionSnap | null> | null = null;

function ensureApiUrl() {
  if (!getApiUrl()) setApiUrl(process.env.EXPO_PUBLIC_API_URL ?? "");
  if (!getApiUrl()) setApiUrl(CLOUD_API_URL);
}

/** Bir marta o'qiladi: ikkinchi import jonli store'ni eski nusxa bilan almashtirib yuboradi. */
export function hydrateApp(): Promise<SessionSnap | null> {
  if (!hydrating) hydrating = readSaved();
  return hydrating;
}

async function readSaved(): Promise<SessionSnap | null> {
  const sess = await AsyncStorage.getItem(SESSION_KEY);
  let snap: SessionSnap | null = null;
  if (sess) {
    try {
      const parsed = JSON.parse(sess) as SessionSnap;
      const locale: Locale = parsed.locale === "ru" ? "ru" : "uz";
      setLocale(locale);
      const applied = getLocale();
      setApiUrl(typeof parsed.apiUrl === "string" ? parsed.apiUrl : "");
      ensureApiUrl();
      const dock: AppDock = parsed.dock === "courier" || parsed.dock === "admin" ? parsed.dock : "sender";
      const savedAccount = parsed.account;
      const account =
        savedAccount && typeof savedAccount === "object" && typeof savedAccount.id === "string" ? savedAccount : null;
      snap = {
        accountId: typeof parsed.accountId === "string" ? parsed.accountId : account?.id ?? null,
        account,
        dock,
        locale: applied,
        pushOn: parsed.pushOn !== false,
        apiUrl: getApiUrl(),
        token: typeof parsed.token === "string" && parsed.token ? parsed.token : null,
      };
    } catch {
      snap = null;
    }
  }

  ensureApiUrl();

  if (!getApiUrl()) {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (raw) {
      try {
        if (importSnapshot(JSON.parse(raw))) {
          lastStore = raw;
        }
      } catch {
        // Buzilgan snapshot — yangi sessiya.
      }
    }
  }

  startCloudSync();
  return snap;
}

export function scheduleStoreSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void flushStore();
  }, 400);
}

export async function flushStore() {
  const json = JSON.stringify(exportSnapshot());
  if (json === lastStore) return;
  lastStore = json;
  await AsyncStorage.setItem(STORE_KEY, json);
}

export async function saveSession(snap: SessionSnap) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(snap));
}
