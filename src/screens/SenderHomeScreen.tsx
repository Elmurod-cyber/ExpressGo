import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { MapBoard } from "../components/MapBoard";
import { Screen } from "../components/Screen";
import { useSession } from "../context/Session";
import { useNight } from "../services/theme";
import { api } from "../services/api";
import { formatMoney } from "../services/money";
import { VEHICLE_LABEL, formatReadyAt, formatWaitSec, isJobOpen, readyHint } from "../server/rules";
import type { ChatThread, InboxNote, MapPin, OrderStatus, SenderOrder } from "../types";
import { statusLabel } from "../components/orderStatus";
import { CreateOrderScreen } from "./CreateOrderScreen";
import { OrderDetailSheet, stopViews } from "../components/OrderDetailSheet";
import { BrandMark } from "../components/BrandMark";
import { InboxPanel } from "../components/InboxPanel";
import { ProfilePanel } from "../components/ProfilePanel";
import { useInbox } from "../hooks/useInbox";
import { HistoryStats } from "../components/HistoryStats";
import { ChatBox } from "../components/ChatBox";
import { SenderTabBar, type SenderPage } from "../components/SenderTabBar";
import { KitchenPanel } from "../components/FoodBoard";

type SenderTab = "active" | "map" | "history";

const liveStatuses: OrderStatus[] = ["posted", "accepted", "picked_up"];
const historyStatuses: OrderStatus[] = ["delivered", "cancelled"];

function trackLine(order: SenderOrder, t: (key: string, vars?: Record<string, string | number>) => string): string | null {
  if (order.status === "posted") {
    return readyHint(order.readyAt) ?? t("sender.waiting");
  }
  if (order.status === "accepted" && order.arrivedAt) {
    if (order.waitFreeLeftSec > 0) {
      return t("sender.wait_free", { time: formatWaitSec(order.waitFreeLeftSec) });
    }
    return `${t("sender.wait_fee", { money: formatMoney(order.waitFee) })}${order.waitMaxed ? t("sender.wait_max") : ""}`;
  }
  const name = order.courierName ?? t("dock.courier");
  if (!order.courierOnline) return `${name}: ${t("sender.no_signal")}`;
  const where =
    order.headingTo === "dropoff"
      ? order.dropoffs.length > 1
        ? t("sender.to_stop", { n: order.stopIndex + 1 })
        : t("sender.to_drop")
      : t("sender.to_pickup");
  const km = order.courierKm != null ? t("sender.km", { n: order.courierKm }) : null;
  const eta = order.etaMinutes != null ? t("sender.eta", { n: order.etaMinutes }) : null;
  return [name, where, km, eta].filter(Boolean).join(" · ");
}

function senderPins(orders: SenderOrder[], t: (key: string, vars?: Record<string, string | number>) => string): MapPin[] {
  const pins: MapPin[] = [];
  for (const order of orders) {
    if (order.pickupLat != null && order.pickupLng != null) {
      pins.push({
        id: `${order.id}-pickup`,
        kind: "job",
        lat: order.pickupLat,
        lng: order.pickupLng,
        label: t("sender.pin_pick", { item: order.item }),
        tone: "job",
      });
    }
    const dests = order.dropoffs.length
      ? order.dropoffs
      : order.dropoffLat != null && order.dropoffLng != null
        ? [{ label: t("dropoff"), lat: order.dropoffLat, lng: order.dropoffLng }]
        : [];
    dests.forEach((stop, index) => {
      pins.push({
        id: `${order.id}-d${index}`,
        kind: "job",
        lat: stop.lat,
        lng: stop.lng,
        label: dests.length > 1 ? t("sheet.stop", { n: index + 1 }) : t("dropoff"),
        tone: order.status === "picked_up" && index === order.stopIndex ? "busy" : "job",
      });
    });
    if (order.courierLat != null && order.courierLng != null) {
      const eta = order.etaMinutes != null ? t("sender.daq", { n: order.etaMinutes }) : "";
      pins.push({
        id: `${order.id}-courier`,
        kind: "courier",
        lat: order.courierLat,
        lng: order.courierLng,
        label: `${order.courierName ?? t("dock.courier")}${eta}`,
        tone: "free",
      });
    }
  }
  return pins;
}

type Composer = { mode: "create" | "edit" | "repeat"; order?: SenderOrder };

function useSenderOrders(userId?: string) {
  const [orders, setOrders] = useState<SenderOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setOrders(await api.listSenderOrders(userId));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "E'lonlar ochilmadi.");
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const id = setInterval(() => {
      void api.listSenderOrders(userId).then(setOrders).catch(() => undefined);
    }, 2000);
    return () => clearInterval(id);
  }, [userId]);

  return { orders, error, setError, load };
}

export function SenderApp({
  focus,
  showTabBar = true,
  onBack,
}: {
  focus?: SenderPage;
  showTabBar?: boolean;
  onBack?: () => void;
} = {}) {
  const { account, t } = useSession();
  const night = useNight();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<SenderPage>(focus ?? "home");
  useEffect(() => {
    if (focus) setPage(focus);
  }, [focus]);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [opened, setOpened] = useState<SenderOrder | null>(null);
  const [sent, setSent] = useState(false);
  const { orders, error, setError, load } = useSenderOrders(account?.id);
  const { inbox, markRead } = useInbox(account?.id);

  useEffect(() => {
    setOpened((prev) => (prev ? (orders.find((order) => order.id === prev.id) ?? null) : null));
  }, [orders]);

  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => setSent(false), 3000);
    return () => clearTimeout(timer);
  }, [sent]);

  if (composer) {
    return (
      <CreateOrderScreen
        mode={composer.mode}
        draft={composer.order ?? null}
        onDone={(ok) => {
          setComposer(null);
          if (ok) setSent(true);
        }}
      />
    );
  }

  function openOrder(order: SenderOrder) {
    setOpened(order);
    setPage("orders");
  }

  return (
    <View className="flex-1">
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t("build.back")}
          className="absolute left-3 z-30 h-10 w-10 items-center justify-center rounded-full bg-card"
          style={{ top: insets.top + 8, elevation: 4 }}
        >
          <Ionicons name="chevron-back" size={22} color={night ? "#F4F6FB" : "#171717"} />
        </Pressable>
      ) : null}
      <View className="flex-1">
        {page === "home" ? (
          <SenderHome
            orders={orders}
            error={error}
            onCreate={() => setComposer({ mode: "create" })}
            onOpen={openOrder}
            onSeeAll={() => setPage("orders")}
            onKitchenSent={() => void load()}
          />
        ) : null}
        {page === "orders" ? (
          <SenderOrders
            orders={orders}
            error={error}
            setError={setError}
            load={load}
            opened={opened}
            setOpened={setOpened}
            onEdit={(order) => setComposer({ mode: "edit", order })}
            onRepeat={(order) => setComposer({ mode: "repeat", order })}
          />
        ) : null}
        {page === "chat" ? (
          <SenderChat
            notes={inbox.notes}
            onReadAll={() => void markRead()}
            onOpenNote={(note) => {
              void markRead(note.id);
              const hit = note.jobId ? orders.find((order) => order.id === note.jobId) : null;
              if (hit) openOrder(hit);
            }}
          />
        ) : null}
        {page === "profile" ? <SenderProfile /> : null}
      </View>
      {showTabBar ? <SenderTabBar page={page} unread={inbox.unread} onChange={setPage} /> : null}
      {sent ? (
        <View
          pointerEvents="none"
          className="absolute left-4 right-4 z-20 flex-row items-center rounded-2xl bg-[#12B76A] px-4 py-3"
          style={{ top: insets.top + 8 }}
        >
          <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
          <Text className="ml-2 flex-1 text-sm font-bold text-white">{t("create.sent")}</Text>
        </View>
      ) : null}
    </View>
  );
}

function orderStats(orders: SenderOrder[]) {
  const active = orders.filter((order) => liveStatuses.includes(order.status)).length;
  const delivered = orders.filter((order) => order.status === "delivered").length;
  const cancelled = orders.filter((order) => order.status === "cancelled").length;
  const rated = orders.filter((order) => order.senderRating != null);
  const avg =
    rated.length > 0
      ? Math.round((rated.reduce((sum, order) => sum + (order.senderRating ?? 0), 0) / rated.length) * 10) / 10
      : null;
  const turnover = orders
    .filter((order) => order.status !== "cancelled")
    .reduce((sum, order) => sum + order.deliveryFee, 0);
  return { active, delivered, cancelled, turnover, avg };
}

function SenderHome({
  orders,
  error,
  onCreate,
  onOpen,
  onSeeAll,
  onKitchenSent,
}: {
  orders: SenderOrder[];
  error: string | null;
  onCreate: () => void;
  onOpen: (order: SenderOrder) => void;
  onSeeAll: () => void;
  onKitchenSent: () => void;
}) {
  const { account, t } = useSession();
  const stats = useMemo(() => orderStats(orders), [orders]);
  const live = orders.filter((order) => liveStatuses.includes(order.status));
  const current = live[0];

  return (
    <Screen>
      <View className="px-4 pt-3">
        <View className="flex-row items-center">
          <BrandMark />
          <Text className="ml-3 flex-1 text-base font-semibold text-ink" numberOfLines={1}>
            {t("sender.hello", { name: account?.name ?? t("dock.sender") })}
          </Text>
        </View>
        {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}
        {account ? <KitchenPanel userId={account.id} onSent={onKitchenSent} /> : null}

        <View className="mt-4 overflow-hidden rounded-[28px] bg-[#121212] px-5 py-5">
          <View className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-brand-sky/25" />
          <Text className="text-sm font-medium text-brand-sky">Express Go</Text>
          <Text className="mt-2 text-sm leading-5 text-white/70">{t("sender.hero")}</Text>
          <Pressable
            onPress={onCreate}
            accessibilityRole="button"
            className="mt-5 items-center rounded-full bg-brand py-3.5 active:opacity-90"
          >
            <Text className="text-base font-bold text-white">{t("sender.new_btn")}</Text>
          </Pressable>
          <View className="mt-5 flex-row">
            <Stat value={String(stats.active)} label={t("sender.active_n")} />
            <Stat value={String(stats.delivered)} label={t("courier.delivered_n")} />
          </View>
          <Text className="mt-4 text-xs text-white/50">{t("sender.turn")}</Text>
          <Text className="mt-1 text-2xl font-bold text-white">{formatMoney(stats.turnover)}</Text>
        </View>

        <View className="mt-4 flex-row items-center justify-between">
          <Text className="text-base font-bold text-ink">{t("sender.live_title")}</Text>
          {live.length > 1 ? (
            <Pressable onPress={onSeeAll} accessibilityRole="button">
              <Text className="text-sm font-semibold text-brand">{t("sender.see_all")}</Text>
            </Pressable>
          ) : null}
        </View>
        {current ? (
          <View className="mt-3">
            <OrderRow order={current} map={false} onOpen={() => onOpen(current)} />
          </View>
        ) : (
          <View className="mt-3 rounded-3xl bg-card px-5 py-8">
            <Text className="text-base font-semibold text-ink">{t("sender.empty_live")}</Text>
            <Text className="mt-2 text-sm text-muted">{t("sender.live_hint")}</Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

function SenderOrders({
  orders,
  error,
  setError,
  load,
  opened,
  setOpened,
  onEdit,
  onRepeat,
}: {
  orders: SenderOrder[];
  error: string | null;
  setError: (value: string | null) => void;
  load: () => Promise<void>;
  opened: SenderOrder | null;
  setOpened: (order: SenderOrder | null) => void;
  onEdit: (order: SenderOrder) => void;
  onRepeat: (order: SenderOrder) => void;
}) {
  const { account, t } = useSession();
  const [tab, setTab] = useState<SenderTab>("active");
  const stats = useMemo(() => orderStats(orders), [orders]);

  async function cancel(order: SenderOrder) {
    if (!account) return;
    const go = async () => {
      try {
        await api.cancelOrder(account.id, order.id);
        setOpened(null);
        await load();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Bekor qilib bo'lmadi.");
      }
    };
    if (order.cancelTotal <= 0) {
      await go();
      return;
    }
    Alert.alert(
      t("cancel"),
      t("sender.cancel_q", { label: order.cancelLabel, money: formatMoney(order.cancelTotal) }),
      [
        { text: t("no"), style: "cancel" },
        { text: t("cancel"), style: "destructive", onPress: () => void go() },
      ],
    );
  }

  async function rate(stars: number) {
    if (!account || !opened) return;
    try {
      const next = await api.rateAsSender(account.id, opened.id, stars);
      setOpened(next);
      setError(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Baho qo'yilmadi.");
    }
  }

  const visible = useMemo(() => {
    const pool = tab === "history" ? historyStatuses : liveStatuses;
    return orders.filter((order) => pool.includes(order.status));
  }, [orders, tab]);

  const pins = useMemo(
    () => senderPins(orders.filter((order) => liveStatuses.includes(order.status)), t),
    [orders, t],
  );

  return (
    <Screen>
      <View className="px-4 pt-3">
        <BrandMark />
        {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}

        {opened ? (
          <OrderDetailSheet
            item={opened.item}
            who={opened.courierName ?? opened.customerName}
            status={opened.status}
            pickup={opened.pickup}
            dropoff={opened.dropoff}
            stops={stopViews(opened)}
            customerName={opened.customerName}
            customerPhone={opened.customerPhone}
            note={opened.note}
            vehicle={opened.vehicle}
            readyAt={opened.readyAt}
            hint={trackLine(opened, t)}
            arrivedAt={opened.arrivedAt}
            waitFee={opened.waitFee}
            cancelTotal={opened.cancelTotal}
            cancelLabel={opened.cancelLabel}
            primaryLabel={
              opened.cancelAllowed
                ? opened.cancelTotal > 0
                  ? t("sender.cancel_money", { money: formatMoney(opened.cancelTotal) })
                  : t("cancel")
                : undefined
            }
            onPrimary={opened.cancelAllowed ? () => void cancel(opened) : undefined}
            secondaryLabel={
              opened.status === "posted"
                ? t("sender.edit")
                : opened.status === "delivered" || opened.status === "cancelled"
                  ? t("sender.repeat")
                  : null
            }
            onSecondary={
              opened.status === "posted"
                ? () => onEdit(opened)
                : opened.status === "delivered" || opened.status === "cancelled"
                  ? () => onRepeat(opened)
                  : undefined
            }
            proofRole="sender"
            pickupPhoto={opened.pickupPhoto}
            dropoffPhoto={opened.dropoffPhoto}
            signature={opened.signature}
            senderRating={opened.senderRating}
            courierRating={opened.courierRating}
            onRate={opened.status === "delivered" && opened.senderRating == null ? rate : undefined}
            onClose={() => setOpened(null)}
            chatUserId={account?.id}
            chatJobId={opened.id}
            chatJobKind="order"
          />
        ) : (
          <>
            <View className="mt-4 flex-row">
              <Segment icon="list" label={t("tab.active")} selected={tab === "active"} onPress={() => setTab("active")} />
              <View className="w-2" />
              <Segment icon="map" label={t("tab.map")} selected={tab === "map"} onPress={() => setTab("map")} />
              <View className="w-2" />
              <Segment icon="time" label={t("tab.history")} selected={tab === "history"} onPress={() => setTab("history")} />
            </View>

            {tab === "map" ? (
              <View className="mt-3">
                <MapBoard pins={pins} />
                <Text className="mt-2 text-xs text-muted">{t("sender.legend")}</Text>
              </View>
            ) : null}

            {tab === "history" ? (
              <View className="mt-3">
                <HistoryStats
                  items={[
                    { label: t("courier.delivered_n"), value: String(stats.delivered) },
                    { label: t("courier.cancelled_n"), value: String(stats.cancelled) },
                    { label: t("sender.turn"), value: formatMoney(stats.turnover) },
                    { label: t("sender.avg"), value: stats.avg != null ? `${stats.avg}/5` : "—" },
                  ]}
                />
              </View>
            ) : null}

            <View className="mt-3">
              {visible.length === 0 ? (
                <View className="rounded-3xl bg-card px-5 py-8">
                  <Text className="text-base font-semibold text-ink">
                    {tab === "history" ? t("sender.empty_hist") : t("sender.empty_live")}
                  </Text>
                  <Text className="mt-2 text-sm text-muted">
                    {tab === "history" ? t("sender.hist_hint") : t("sender.live_hint")}
                  </Text>
                </View>
              ) : (
                visible.map((order) => (
                  <OrderRow key={order.id} order={order} map={tab === "map"} onOpen={() => setOpened(order)} />
                ))
              )}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

function SenderChat({
  notes,
  onReadAll,
  onOpenNote,
}: {
  notes: InboxNote[];
  onReadAll: () => void;
  onOpenNote: (note: InboxNote) => void;
}) {
  const { account, t } = useSession();
  const [mode, setMode] = useState<"threads" | "notes">("threads");
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [opened, setOpened] = useState<ChatThread | null>(null);

  const load = useCallback(async () => {
    if (!account) return;
    try {
      const next = await api.listChatThreads(account.id);
      setThreads(next);
      setOpened((prev) => (prev ? (next.find((item) => item.jobId === prev.jobId && item.jobKind === prev.jobKind) ?? prev) : null));
    } catch {
      // Keyingi urinishda.
    }
  }, [account]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!account) return;
    const id = setInterval(() => void load(), 2000);
    return () => clearInterval(id);
  }, [account, load]);

  return (
    <Screen compact>
      <View className="px-4 pt-3">
        <View className="flex-row items-center">
          <BrandMark />
          <Text className="ml-3 text-lg font-bold text-ink">{t("nav.chat")}</Text>
        </View>

        {opened && account ? (
          <View className="mt-4">
            <Pressable onPress={() => setOpened(null)} accessibilityRole="button" className="mb-2 flex-row items-center">
              <Ionicons name="chevron-back" size={18} color="#155EEF" />
              <Text className="ml-1 text-sm font-semibold text-brand">{t("chat.back")}</Text>
            </Pressable>
            <Text className="text-lg font-bold text-ink">{opened.title}</Text>
            <Text className="mt-1 text-sm text-muted">{opened.peerName}</Text>
            <ChatBox userId={account.id} jobId={opened.jobId} jobKind={opened.jobKind} expanded />
          </View>
        ) : (
          <>
            <View className="mt-4 flex-row">
              <Segment icon="list" label={t("chat.threads")} selected={mode === "threads"} onPress={() => setMode("threads")} />
              <View className="w-2" />
              <Segment icon="time" label={t("chat.notes")} selected={mode === "notes"} onPress={() => setMode("notes")} />
            </View>
            {mode === "notes" ? (
              <InboxPanel notes={notes} onReadAll={onReadAll} onOpen={onOpenNote} />
            ) : threads.length === 0 ? (
              <View className="mt-4 rounded-3xl bg-card px-5 py-8">
                <Text className="text-base font-semibold text-ink">{t("chat.threads_empty")}</Text>
                <Text className="mt-2 text-sm text-muted">{t("chat.threads_hint")}</Text>
              </View>
            ) : (
              threads.map((thread) => (
                <Pressable
                  key={`${thread.jobKind}-${thread.jobId}`}
                  onPress={() => setOpened(thread)}
                  accessibilityRole="button"
                  className="mt-3 rounded-3xl bg-card px-4 py-4"
                >
                  <View className="flex-row items-start justify-between">
                    <Text className="flex-1 pr-2 text-base font-bold text-ink">{thread.title}</Text>
                    {thread.lastAt ? <Text className="text-xs text-muted">{ago(thread.lastAt, t)}</Text> : null}
                  </View>
                  <Text className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">
                    {(thread.peerName || t("dock.courier")).toUpperCase()}
                  </Text>
                  <Text className="mt-2 text-sm text-muted" numberOfLines={2}>
                    {thread.lastText || t("chat.no_msg")}
                  </Text>
                </Pressable>
              ))
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

function SenderProfile() {
  return (
    <Screen scroll={false}>
      <View className="min-h-0 flex-1 px-4 pb-3 pt-3">
        <ProfilePanel docked />
      </View>
    </Screen>
  );
}

function ago(at: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const sec = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (sec < 20) return t("inbox.now");
  if (sec < 60) return t("inbox.sec", { n: sec });
  const min = Math.round(sec / 60);
  if (min < 60) return t("inbox.min", { n: min });
  return t("inbox.hour", { n: Math.round(min / 60) });
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1">
      <Text className="text-xs text-white/50">{label}</Text>
      <Text className="mt-1 text-2xl font-bold text-white">{value}</Text>
    </View>
  );
}

function Segment({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: "list" | "map" | "time";
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-1 flex-row items-center justify-center rounded-2xl py-3 ${selected ? "bg-[#121212]" : "bg-card"}`}
    >
      <Ionicons
        name={icon === "list" ? "list" : icon === "time" ? "time-outline" : "map-outline"}
        size={16}
        color={selected ? "#FFFFFF" : "#667085"}
      />
      <Text className={`ml-2 text-sm font-semibold ${selected ? "text-white" : "text-muted"}`}>{label}</Text>
    </Pressable>
  );
}

function OrderRow({ order, map, onOpen }: { order: SenderOrder; map: boolean; onOpen: () => void }) {
  const { t } = useSession();
  const night = useNight();
  const waiting = order.status === "posted";
  const track = trackLine(order, t);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      className={`mb-3 rounded-3xl px-4 py-2.5 ${night ? "border border-[#3A3A3A] bg-[#2C2C2C]" : "bg-[#E7EEF6]"}`}
    >
      <View className="flex-row items-start justify-between">
        <Text className={`flex-1 pr-3 text-lg font-bold ${night ? "text-[#F4F6FB]" : "text-ink"}`}>{order.item}</Text>
        <View className="flex-row items-center">
          <View className={`mr-1.5 h-2 w-2 rounded-full ${waiting ? "bg-[#F5A524]" : night ? "bg-[#8EBCFF]" : "bg-brand"}`} />
          <Text className={`text-xs font-semibold ${waiting ? (night ? "text-[#F5C16C]" : "text-[#C47E09]") : night ? "text-[#8EBCFF]" : "text-brand"}`}>
            {waiting ? (isJobOpen(order.readyAt) ? t("sender.waiting_short") : formatReadyAt(order.readyAt)) : statusLabel[order.status]}
          </Text>
        </View>
      </View>
      <Text className={`mt-1 text-xs font-medium uppercase tracking-wide ${night ? "text-[#C8C8C8]" : "text-muted"}`}>
        {(order.courierName ?? order.customerName).toUpperCase()}
      </Text>
      <View className="mt-3 flex-row">
        <Ionicons name="location-sharp" size={16} color="#98A2B3" />
        <Text className={`ml-2 flex-1 ${night ? "text-[#F4F6FB]" : "text-ink"} ${map ? "text-base font-semibold" : "text-sm"}`}>{order.pickup}</Text>
      </View>
      <View className="mt-2 flex-row">
        <Ionicons name="flag" size={15} color="#98A2B3" />
        <Text className={`ml-2 flex-1 ${night ? "text-[#F4F6FB]" : "text-ink"} ${map ? "text-base font-semibold" : "text-sm"}`}>
          {order.dropoffs.length > 1 ? order.dropoffs.map((stop) => stop.label).join(" → ") : order.dropoff}
        </Text>
      </View>
      {order.dropoffs.length > 1 ? (
        <Text className={`mt-1 text-xs font-semibold ${night ? "text-[#F4F6FB]" : "text-ink"}`}>{t("sender.stops", { n: order.dropoffs.length })}</Text>
      ) : null}
      <Text className={`mt-1 text-xs ${night ? "text-[#C8C8C8]" : "text-muted"}`}>{t("sender.transport", { name: VEHICLE_LABEL[order.vehicle] })}</Text>
      {waiting && readyHint(order.readyAt) ? (
        <Text className={`mt-1 text-xs font-semibold ${night ? "text-[#F5C16C]" : "text-[#C47E09]"}`}>{readyHint(order.readyAt)}</Text>
      ) : null}
      {track ? <Text className={`mt-2 text-sm font-semibold ${night ? "text-[#8EBCFF]" : "text-brand"}`}>{track}</Text> : null}
      {order.cancelAllowed && order.cancelTotal > 0 ? (
        <Text className={`mt-1 text-xs ${night ? "text-[#FF8B7A]" : "text-[#B42318]"}`}>{t("sender.cancel_fee", { money: formatMoney(order.cancelTotal) })}</Text>
      ) : null}
      <Text className={`mt-2 self-end text-[21px] font-extrabold ${night ? "text-[#FF7A40]" : "text-[#C2410C]"}`}>{formatMoney(order.deliveryFee)}</Text>
      {order.status === "delivered" && order.senderRating == null ? (
        <Text className={`mt-2 text-xs font-semibold ${night ? "text-[#8EBCFF]" : "text-brand"}`}>{t("sender.rate_hint")}</Text>
      ) : order.senderRating != null ? (
        <Text className={`mt-2 text-xs ${night ? "text-[#C8C8C8]" : "text-muted"}`}>{t("sender.rated", { n: order.senderRating })}</Text>
      ) : null}
    </Pressable>
  );
}
