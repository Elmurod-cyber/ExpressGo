import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../components/Screen";
import { CityTabBar, type CityTab } from "../components/CityTabBar";
import { ProfilePanel } from "../components/ProfilePanel";
import { AdminEntry } from "../components/DemoDock";
import { useSession, useT } from "../context/Session";
import { WelcomeScreen } from "../screens/WelcomeScreen";
import { RegisterScreen } from "../screens/RegisterScreen";
import { SenderApp } from "../screens/SenderHomeScreen";
import { CourierHomeScreen } from "../screens/CourierHomeScreen";
import { api } from "../services/api";
import type { Role } from "../types";

export function CityShell() {
  const { account } = useSession();
  const [tab, setTab] = useState<CityTab>("home");
  const [homeKey, setHomeKey] = useState(0);
  const [chrome, setChrome] = useState(false);
  const [jumpJob, setJumpJob] = useState(false);
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
    <View className="flex-1 bg-[#171717]">
      <View className="flex-1">
        {tab === "home" ? <WelcomeScreen key={homeKey} onChrome={onChrome} /> : null}
        {tab === "orders" ? <AccountOrders openActive={jumpJob} onActiveOpened={() => setJumpJob(false)} /> : null}
        {tab === "profile" ? <AccountProfile /> : null}
      </View>
      {account && chrome ? <CityTabBar tab={tab} onChange={go} /> : null}
      {account?.role === "courier" && chrome && tab !== "orders" ? (
        <ActiveJobChip onOpen={() => { setJumpJob(true); go("orders"); }} />
      ) : null}
    </View>
  );
}

function AccountOrders({ openActive, onActiveOpened }: { openActive?: boolean; onActiveOpened?: () => void }) {
  const { account } = useSession();
  const [role, setRole] = useState<Role | null>(null);
  if (!account) {
    if (!role) return <RoleGate onPick={setRole} />;
    return <RegisterScreen role={role} onBack={() => setRole(null)} />;
  }
  if (account.role === "courier") {
    return <CourierHomeScreen lockedPage="orders" showTabBar={false} openActive={openActive} onActiveOpened={onActiveOpened} />;
  }
  return <SenderApp focus="orders" showTabBar={false} />;
}

function ActiveJobChip({ onOpen }: { onOpen: () => void }) {
  const { account, t } = useSession();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!account || account.role !== "courier") return;
    const id = account.id;
    let stop = false;
    async function look() {
      try {
        const board = await api.getCourierBoard(id);
        if (!stop) setVisible(Boolean(board.active || board.activeErrand));
      } catch {
        if (!stop) setVisible(false);
      }
    }
    void look();
    const timer = setInterval(() => void look(), 4000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [account]);

  if (!visible) return null;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={t("courier.mine_order")}
      className="absolute right-4 flex-row items-center rounded-full bg-[#C2410C] px-4 py-3 active:opacity-90"
      style={{
        position: "absolute",
        right: 16,
        bottom: Math.max(insets.bottom, 8) + 68,
        zIndex: 50,
        elevation: 12,
      }}
    >
      <Ionicons name="cube" size={18} color="#FFFFFF" />
      <Text className="ml-2 text-sm font-bold text-white">{t("courier.mine_order")}</Text>
    </Pressable>
  );
}

function AccountProfile() {
  const { account } = useSession();
  const [role, setRole] = useState<Role | null>(null);
  if (!account) {
    if (!role) return <RoleGate onPick={setRole} />;
    return <RegisterScreen role={role} onBack={() => setRole(null)} />;
  }
  return (
    <Screen ad={null} compact>
      <View className="px-4 pb-6 pt-3">
        <ProfilePanel />
        <AdminEntry />
      </View>
    </Screen>
  );
}

function RoleGate({ onPick }: { onPick: (role: Role) => void }) {
  const t = useT();
  return (
    <Screen ad={null} compact surface="bg-[#171717]">
      <View className="px-5 pt-6">
        <Text className="text-xl font-bold text-white">{t("nav.need_account")}</Text>
        <Pressable
          onPress={() => onPick("sender")}
          accessibilityRole="button"
          className="mt-6 items-center rounded-2xl bg-[#FF8A00] py-4 active:opacity-90"
        >
          <Text className="text-base font-bold text-[#171717]">{t("welcome.sender")}</Text>
        </Pressable>
        <Pressable
          onPress={() => onPick("courier")}
          accessibilityRole="button"
          className="mt-3 items-center rounded-2xl bg-[#262626] py-4 active:opacity-90"
        >
          <Text className="text-base font-bold text-white">{t("dock.courier")}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
