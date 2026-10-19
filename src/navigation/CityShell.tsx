import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Screen } from "../components/Screen";
import { CityTabBar, type CityTab } from "../components/CityTabBar";
import { ProfilePanel } from "../components/ProfilePanel";
import { AdminEntry } from "../components/DemoDock";
import { useSession, useT } from "../context/Session";
import { WelcomeScreen } from "../screens/WelcomeScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { SenderApp } from "../screens/SenderHomeScreen";

export function CityShell() {
  const { account } = useSession();
  const [tab, setTab] = useState<CityTab>("home");
  const [homeKey, setHomeKey] = useState(0);
  const [chrome, setChrome] = useState(false);
  const onChrome = useCallback((visible: boolean) => setChrome(visible), []);

  useEffect(() => {
    if (!account) setTab("home");
  }, [account]);

  function go(next: CityTab) {
    if (next === "home") setHomeKey((key) => key + 1);
    setChrome(true);
    setTab(next);
  }

  return (
    <View className="flex-1 bg-canvas">
      <View className="flex-1">
        {tab === "home" ? <WelcomeScreen key={homeKey} onChrome={onChrome} onProfile={() => go("profile")} /> : null}
        {tab === "orders" ? <AccountOrders /> : null}
        {tab === "profile" ? <AccountProfile onCancel={() => setTab("home")} /> : null}
      </View>
      {account && chrome ? <CityTabBar tab={tab} onChange={go} /> : null}
    </View>
  );
}

function AccountOrders() {
  const { account } = useSession();
  const t = useT();
  const [signing, setSigning] = useState(false);
  if (!account) {
    if (!signing) {
      return (
        <Screen compact>
          <View className="px-5 pt-6">
            <Text className="text-xl font-bold text-ink">{t("nav.need_account")}</Text>
            <Pressable
              onPress={() => setSigning(true)}
              accessibilityRole="button"
              className="mt-6 items-center rounded-2xl bg-[#FF8A00] py-4 active:opacity-90"
            >
              <Text className="text-base font-bold text-[#171717]">{t("welcome.sender")}</Text>
            </Pressable>
          </View>
        </Screen>
      );
    }
    return <RegisterScreen role="sender" onBack={() => setSigning(false)} />;
  }
  if (account.role === "courier") {
    return (
      <Screen compact>
        <View className="px-5 pt-8">
          <Text className="text-base leading-6 text-ink">{t("city.worker_app")}</Text>
        </View>
      </Screen>
    );
  }
  return <SenderApp focus="orders" showTabBar={false} />;
}

function AccountProfile({ onCancel }: { onCancel: () => void }) {
  const { account } = useSession();
  if (!account) return <RegisterScreen role="sender" onBack={onCancel} />;
  return (
    <Screen compact>
      <View className="px-4 pb-6 pt-3">
        <ProfilePanel />
        <AdminEntry />
      </View>
    </Screen>
  );
}

