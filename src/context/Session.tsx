import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import type { Account } from "../types";
import type { AppDock } from "../components/DemoDock";
import { api } from "../services/api";
import { getLocale, setLocale as writeLocale, t, type Locale } from "../i18n";
import { hydrateApp, saveSession, type SessionSnap } from "../server/persist";
import { preparePush } from "../services/push";
import { getApiUrl, setApiUrl as writeApiUrl } from "../services/endpoint";
import { BrandLogo } from "../components/BrandMark";
import { getSessionToken, setSessionToken } from "../services/sessionToken";

type SessionValue = {
  account: Account | null;
  dock: AppDock;
  locale: Locale;
  pushOn: boolean;
  apiUrl: string;
  setApiUrl: (url: string) => void;
  setPushOn: (on: boolean) => void;
  setLocale: (locale: Locale) => void;
  t: typeof t;
  setDock: (dock: AppDock) => void;
  signIn: (account: Account, token: string) => Promise<void>;
  replaceAccount: (account: Account) => void;
  signOut: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [dock, setDockState] = useState<AppDock>("sender");
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [pushOn, setPushOnState] = useState(true);
  const [apiUrl, setApiUrlState] = useState("");
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);

  const persistNow = useCallback((next: Omit<SessionSnap, "apiUrl" | "token"> & { apiUrl?: string; token?: string | null }) => {
    if (!readyRef.current) return;
    const token = next.token === undefined ? getSessionToken() || null : next.token;
    void saveSession({ ...next, apiUrl: next.apiUrl ?? getApiUrl(), token });
  }, []);

  const setLocale = useCallback(
    (next: Locale) => {
      writeLocale(next);
      const applied = getLocale();
      setLocaleState(applied);
      persistNow({ accountId: account?.id ?? null, account, dock, locale: applied, pushOn });
    },
    [account, dock, persistNow, pushOn],
  );

  const signIn = useCallback(async (seed: Account, token: string) => {
    setSessionToken(token);
    const nextDock: AppDock = seed.role === "courier" ? "courier" : "sender";
    setAccount(seed);
    setDockState(nextDock);
    persistNow({ accountId: seed.id, account: seed, dock: nextDock, locale: getLocale(), pushOn, token });
    if (pushOn) void preparePush(seed.id);
  }, [persistNow, pushOn]);

  const replaceAccount = useCallback((next: Account) => {
    if (!account || account.id !== next.id) return;
    setAccount(next);
    persistNow({ accountId: next.id, account: next, dock, locale, pushOn });
  }, [account, dock, locale, persistNow, pushOn]);

  const setDock = useCallback(
    (next: AppDock) => {
      if (next === "admin") {
        if (!account?.isAdmin) return;
        setDockState("admin");
        persistNow({ accountId: account.id, account, dock: "admin", locale, pushOn });
        return;
      }
      const role: AppDock = account?.role === "courier" ? "courier" : "sender";
      if (next !== role) return;
      setDockState(role);
      persistNow({ accountId: account?.id ?? null, account, dock: role, locale, pushOn });
    },
    [account, locale, pushOn, persistNow],
  );

  const signOut = useCallback(() => {
    setAccount(null);
    setDockState("sender");
    setSessionToken("");
    persistNow({ accountId: null, account: null, dock: "sender", locale: getLocale(), pushOn, token: null });
  }, [persistNow, pushOn]);

  const setPushOn = useCallback(
    (on: boolean) => {
      setPushOnState(on);
      persistNow({ accountId: account?.id ?? null, account, dock, locale, pushOn: on });
      if (on) void preparePush(account?.id);
    },
    [account, dock, locale, persistNow],
  );

  const setApiUrl = useCallback(
    (url: string) => {
      const previous = getApiUrl();
      writeApiUrl(url);
      const next = getApiUrl();
      setApiUrlState(next);
      if (next !== previous) {
        setSessionToken("");
        setAccount(null);
        setDockState("sender");
        persistNow({ accountId: null, account: null, dock: "sender", locale, pushOn, apiUrl: next, token: null });
        return;
      }
      persistNow({ accountId: account?.id ?? null, account, dock, locale, pushOn, apiUrl: next });
    },
    [account, dock, locale, persistNow, pushOn],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sess = await hydrateApp();
      if (cancelled) return;
      setApiUrlState(getApiUrl());
      if (sess) {
        setLocaleState(sess.locale);
        setDockState(sess.dock === "courier" ? "courier" : "sender");
        setPushOnState(sess.pushOn);
        setApiUrlState(sess.apiUrl);
        if (sess.token) {
          setSessionToken(sess.token);
          try {
            const seed = await api.getAccount(sess.accountId ?? "");
            if (cancelled) return;
            const home: AppDock = seed.role === "courier" ? "courier" : "sender";
            setAccount(seed);
            setDockState(sess.dock === "admin" && seed.isAdmin ? "admin" : home);
            await saveSession({ ...sess, accountId: seed.id, account: seed, dock: sess.dock === "admin" && seed.isAdmin ? "admin" : home });
          } catch (caught) {
            if (cancelled) return;
            const gone = caught instanceof Error && caught.message.includes("Sessiya yo'q");
            if (gone) {
              setSessionToken("");
              setAccount(null);
              await saveSession({ ...sess, accountId: null, account: null, token: null });
            } else if (sess.account) {
              setAccount(sess.account);
            }
          }
        }
      }
      readyRef.current = true;
      setReady(true);
      if (sess?.pushOn !== false) void preparePush(sess?.accountId);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      account,
      dock,
      locale,
      pushOn,
      apiUrl,
      setApiUrl,
      setPushOn,
      setLocale,
      t,
      setDock,
      signIn,
      replaceAccount,
      signOut,
    }),
    [account, dock, locale, pushOn, apiUrl, setApiUrl, setPushOn, setLocale, setDock, signIn, replaceAccount, signOut],
  );

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <BrandLogo width={180} />
        <Text className="mt-4 text-sm text-muted">{t("boot.wait")}</Text>
      </View>
    );
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("Sessiya topilmadi.");
  }
  return value;
}

export function useT() {
  const { t: translate, locale } = useSession();
  void locale;
  return translate;
}
