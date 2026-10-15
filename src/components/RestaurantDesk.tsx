import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "./Screen";
import { api } from "../services/api";
import { formatMoney } from "../services/money";
import { useT } from "../context/Session";
import type { FoodPlace } from "../data/foodPlaces";
import type { FoodDesk, FoodTicket, FoodTicketStatus } from "../types";

type DeskTab = "orders" | "menu" | "settings";
type OrderLane = "new" | "kitchen" | "ready";

function dayStamp(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function formatWhen(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function laneOf(status: FoodTicketStatus): OrderLane | null {
  if (status === "new") return "new";
  if (status === "accepted" || status === "preparing") return "kitchen";
  if (status === "ready") return "ready";
  return null;
}

export function RestaurantDesk({
  place,
  demoPhone,
  onBack,
}: {
  place: FoodPlace;
  demoPhone: string;
  onBack: () => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<DeskTab>("orders");
  const [lane, setLane] = useState<OrderLane>("new");
  const [desk, setDesk] = useState<FoodDesk | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDesk(await api.foodDesk(place.id, demoPhone));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    }
  }, [demoPhone, place.id, t]);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      void load();
    }, 2000);
    return () => clearInterval(id);
  }, [load]);

  async function run(key: string, work: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await work();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    } finally {
      setBusy(null);
    }
  }

  const accepting = desk?.accepting !== false;
  const byTime = (a: FoodTicket, b: FoodTicket) => b.at - a.at;
  const lanes: { id: OrderLane; label: string; items: FoodTicket[] }[] = [
    {
      id: "new",
      label: t("food.lane_new"),
      items: (desk?.tickets ?? []).filter((ticket) => ticket.status === "new").sort(byTime),
    },
    {
      id: "kitchen",
      label: t("food.lane_kitchen"),
      items: (desk?.tickets ?? []).filter((ticket) => ticket.status === "accepted" || ticket.status === "preparing").sort(byTime),
    },
    {
      id: "ready",
      label: t("food.lane_ready"),
      items: (desk?.tickets ?? []).filter((ticket) => ticket.status === "ready").sort(byTime),
    },
  ];
  const current = lanes.find((item) => item.id === lane) ?? lanes[0];

  return (
    <Screen compact>
      <View className="px-4 pt-2">
        <Pressable onPress={onBack} accessibilityRole="button" className="mb-3 flex-row items-center self-start">
          <Ionicons name="chevron-back" size={18} color="#C2410C" />
          <Text className="ml-1 text-sm font-semibold text-[#C2410C]">{t("food.back")}</Text>
        </Pressable>

        <View className="overflow-hidden rounded-[28px] bg-[#121212] px-5 py-5">
          <Text className="text-xs font-semibold uppercase tracking-wide text-white/50">{t("food.manage")}</Text>
          <Text className="mt-1 text-2xl font-bold text-white">{place.name}</Text>
          <View className={`mt-3 self-start rounded-full px-3 py-1.5 ${accepting ? "bg-[#C2410C]" : "bg-white/15"}`}>
            <Text className="text-sm font-bold text-white">{accepting ? t("food.open_now") : t("food.closed_now")}</Text>
          </View>
          {desk ? (
            <Text className={`mt-3 text-sm ${desk.subActive ? "font-semibold text-[#FDBA74]" : "text-white"}`}>
              {desk.subActive && desk.subUntil ? t("food.sub_on", { date: dayStamp(desk.subUntil) }) : t("food.sub_off")}
            </Text>
          ) : null}
          {desk ? <Text className="mt-1 text-sm text-white/70">{t("food.sub_free")}</Text> : null}
          {desk && !desk.subActive ? (
            <Pressable
              onPress={() => void run("sub", () => api.startFoodSub(place.id, demoPhone))}
              disabled={busy !== null}
              accessibilityRole="button"
              className="mt-3 items-center rounded-2xl bg-[#C2410C] py-3.5"
            >
              <Text className="text-center text-sm font-bold text-white">
                {t("food.sub_buy", { money: formatMoney(desk.subPrice) })}
              </Text>
            </Pressable>
          ) : null}
          <View className="mt-4 flex-row">
            <Pressable
              onPress={() => void run("open", () => api.setFoodAccepting(place.id, demoPhone, true))}
              disabled={busy !== null || desk?.subActive === false}
              accessibilityRole="button"
              className={`mr-2 flex-1 items-center rounded-2xl py-3.5 ${accepting ? "bg-[#C2410C]" : "bg-white/10"}`}
            >
              <Text className="text-center text-sm font-bold text-white">{t("food.accepting")}</Text>
            </Pressable>
            <Pressable
              onPress={() => void run("pause", () => api.setFoodAccepting(place.id, demoPhone, false))}
              disabled={busy !== null}
              accessibilityRole="button"
              className={`flex-1 items-center rounded-2xl py-3.5 ${accepting ? "bg-white/10" : "bg-white"}`}
            >
              <Text className={`text-center text-sm font-bold ${accepting ? "text-white" : "text-[#121212]"}`}>{t("food.paused")}</Text>
            </Pressable>
          </View>
        </View>

        <View className="mt-4 flex-row rounded-full bg-white p-1">
          {(
            [
              ["orders", t("food.orders")],
              ["menu", t("food.menu")],
              ["settings", t("food.settings")],
            ] as const
          ).map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => setTab(id)}
              accessibilityRole="button"
              className={`flex-1 items-center rounded-full py-2.5 ${tab === id ? "bg-[#121212]" : ""}`}
            >
              <Text className={`text-xs font-bold ${tab === id ? "text-white" : "text-ink"}`}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text className="mt-3 text-sm text-red-600">{error}</Text> : null}

        {tab === "orders" ? (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerStyle={{ paddingRight: 8 }}>
              {lanes.map((item) => {
                const selected = item.id === current.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setLane(item.id)}
                    accessibilityRole="button"
                    className={`mr-2 max-w-[240px] flex-row items-center rounded-full px-3 py-2.5 ${selected ? "bg-[#121212]" : "bg-white"}`}
                  >
                    <Text className={`flex-shrink text-xs font-bold ${selected ? "text-white" : "text-ink"}`} numberOfLines={2}>
                      {item.label}
                    </Text>
                    <View className={`ml-2 min-w-[22px] items-center rounded-full px-1.5 py-0.5 ${selected ? "bg-[#C2410C]" : "bg-[#FFF7ED]"}`}>
                      <Text className={`text-xs font-bold ${selected ? "text-white" : "text-[#C2410C]"}`}>{item.items.length}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            {current.items.length === 0 ? (
              <Text className="mt-6 text-center text-sm text-muted">{t("food.lane_empty")}</Text>
            ) : (
              current.items.map((ticket) => (
                <OrderCard
                  key={ticket.id}
                  ticket={ticket}
                  busy={busy === ticket.id}
                  canAccept={desk?.subActive !== false}
                  onStatus={(status) => {
                    void run(ticket.id, async () => {
                      await api.setFoodStatus(place.id, demoPhone, ticket.id, status);
                      const next = laneOf(status);
                      if (next) setLane(next);
                    });
                  }}
                />
              ))
            )}
          </View>
        ) : null}

        {tab === "menu" ? (
          <View className="mt-3">
            <Text className="mb-2 text-sm text-muted">{t("food.menu_note")}</Text>
            {place.dishes.map((dish) => (
              <View key={dish.id} className="mb-2 flex-row items-center rounded-3xl bg-white p-3">
                <Image source={dish.image} style={{ width: 64, height: 64, borderRadius: 16 }} resizeMode="cover" />
                <View className="ml-3 min-w-0 flex-1">
                  <Text className="text-base font-bold text-ink">{t(dish.nameKey)}</Text>
                  <Text className="mt-0.5 text-xs text-muted" numberOfLines={2}>
                    {t(dish.detailKey)}
                  </Text>
                  <Text className="mt-1 text-sm font-bold text-[#C2410C]">{formatMoney(dish.price)}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {tab === "settings" ? (
          <View className="mt-3 rounded-3xl bg-white px-4 py-4">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted">{t("food.settings")}</Text>
            <Text className="mt-3 text-lg font-bold text-ink">{place.name}</Text>
            <Text className="mt-2 text-sm leading-5 text-ink">{place.address}</Text>
            <Text className="mt-2 text-sm font-bold text-[#C2410C]">{place.phone}</Text>
            <Text className={`mt-3 text-sm font-semibold ${accepting ? "text-[#C2410C]" : "text-ink"}`}>
              {accepting ? t("food.open_now") : t("food.closed_now")}
            </Text>
          </View>
        ) : null}
        <View className="h-6" />
      </View>
    </Screen>
  );
}

function OrderCard({
  ticket,
  busy,
  canAccept,
  onStatus,
}: {
  ticket: FoodTicket;
  busy: boolean;
  canAccept: boolean;
  onStatus: (status: FoodTicketStatus) => void;
}) {
  const t = useT();
  return (
    <View className={`mt-3 rounded-3xl bg-white px-4 py-4 ${ticket.status === "new" ? "border border-[#FDBA74]" : ""}`}>
      <View className="flex-row items-center">
        <Text className="flex-1 text-base font-bold text-ink">{t("food.order_no", { id: ticket.id })}</Text>
        <View className={`rounded-full px-3 py-1 ${ticket.status === "rejected" ? "bg-[#121212]" : "bg-[#C2410C]"}`}>
          <Text className="text-xs font-bold text-white">{t(`food.status_${ticket.status}`)}</Text>
        </View>
      </View>
      <Text className="mt-2 text-sm text-muted">{formatWhen(ticket.at)}</Text>
      <Text className="mt-3 text-base font-semibold text-ink">{ticket.customerName}</Text>
      <Text className="text-sm text-ink">{ticket.customerPhone}</Text>
      <Text className="mt-1 text-sm text-muted">{ticket.handoff === "pickup" ? t("food.pickup_self") : ticket.dropoff}</Text>
      <View className="mt-3 border-t border-slate-100 pt-3">
        {ticket.lines.map((line) => (
          <Text key={`${ticket.id}-${line.name}`} className="text-sm font-semibold text-ink">
            {line.qty} × {line.name}
          </Text>
        ))}
        <Text className="mt-2 text-base font-bold text-[#C2410C]">{formatMoney(ticket.foodTotal)}</Text>
      </View>
      {ticket.status === "new" && !canAccept ? (
        <View className="mt-4">
          <Text className="text-sm font-semibold text-ink">{t("food.sub_off")}</Text>
          <View className="mt-3">
            <Action label={t("food.reject")} tone="black" disabled={busy} onPress={() => onStatus("rejected")} />
          </View>
        </View>
      ) : null}
      {ticket.status === "new" && canAccept ? (
        <View className="mt-4 flex-row">
          <Action label={t("food.accept")} tone="orange" disabled={busy} onPress={() => onStatus("accepted")} />
          <View className="w-2" />
          <Action label={t("food.reject")} tone="black" disabled={busy} onPress={() => onStatus("rejected")} />
        </View>
      ) : null}
      {ticket.status === "accepted" ? (
        <View className="mt-4 flex-row">
          <Action label={t("food.preparing")} tone="orange" disabled={busy} onPress={() => onStatus("preparing")} />
          <View className="w-2" />
          <Action label={t("food.reject")} tone="black" disabled={busy} onPress={() => onStatus("rejected")} />
        </View>
      ) : null}
      {ticket.status === "preparing" ? (
        <View className="mt-4">
          <Action label={t("food.ready")} tone="orange" disabled={busy} onPress={() => onStatus("ready")} />
        </View>
      ) : null}
    </View>
  );
}

function Action({
  label,
  tone,
  disabled,
  onPress,
}: {
  label: string;
  tone: "orange" | "black";
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`flex-1 items-center rounded-2xl py-4 ${disabled ? "bg-slate-200" : tone === "orange" ? "bg-[#C2410C] active:opacity-90" : "bg-[#121212] active:opacity-90"}`}
    >
      <Text className={`text-base font-bold ${disabled ? "text-slate-500" : "text-white"}`}>{label}</Text>
    </Pressable>
  );
}
