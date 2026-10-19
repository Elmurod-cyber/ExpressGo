import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { Screen } from "../components/Screen";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { BrandMark } from "../components/BrandMark";
import { statusLabel } from "../components/orderStatus";
import { useSession, useT } from "../context/Session";
import { useArea } from "../context/Area";
import { matchesArea } from "../server/places";
import { api } from "../services/api";
import { formatMoney } from "../services/money";
import { VEHICLE_LABEL } from "../server/rules";
import type { BuilderCard, LiveJob, TripCard } from "../types";
import { RegisterScreen } from "./RegisterScreen";
import { SenderApp } from "./SenderHomeScreen";
import { IntercityScreen, TripEntry } from "./IntercityScreen";
import { FoodScreen } from "../components/FoodBoard";
import { BuildScreen } from "./BuildScreen";
import { DeliveryEntry } from "./DeliveryEntry";

type Gate = "sender" | "rider";
type Feed = "all" | "jobs" | "food" | "trips" | "barber" | "builder";

export function WelcomeScreen({ onChrome, onProfile }: { onChrome?: (visible: boolean) => void; onProfile?: () => void }) {
  const t = useT();
  const { account } = useSession();
  const area = useArea();
  const [gate, setGate] = useState<Gate | null>(null);
  const [feed, setFeed] = useState<Feed>("all");
  const [barberAsk, setBarberAsk] = useState(false);
  const [jobs, setJobs] = useState<LiveJob[]>([]);
  const [trips, setTrips] = useState<TripCard[]>([]);
  const [builders, setBuilders] = useState<BuilderCard[]>([]);
  const [boardWidth, setBoardWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [detail, setDetail] = useState<{ kind: "job" | "trip"; id: string } | null>(null);
  const [tripDoor, setTripDoor] = useState<"gate" | "list">("gate");

  const load = useCallback(async () => {
    try {
      const [nextJobs, nextTrips, nextBuilders] = await Promise.all([
        api.listLiveJobs(),
        api.listTrips({ mode: "route" }),
        api.listBuilders(),
      ]);
      setJobs(nextJobs);
      setTrips(nextTrips.slice(0, 20));
      setBuilders(nextBuilders.slice(0, 20));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    } finally {
      setBooting(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [load]);

  function pickFeed(next: Exclude<Feed, "all">) {
    setDetail(null);
    if (feed === next) {
      setFeed("all");
      return;
    }
    if (next === "trips") setTripDoor("gate");
    setFeed(next);
  }

  function openDetail(next: { kind: "job" | "trip"; id: string }) {
    setError(null);
    setDetail(next);
  }

  const localJobs = jobs.filter((job) => matchesArea(area.place, job.region, job.district));
  const localBuilders = builders.filter((builder) => matchesArea(area.place, builder.region, builder.area));
  const city = [
    ...localJobs.map((job) => ({ kind: "job" as const, at: job.at, job })),
    ...trips.map((trip) => ({ kind: "trip" as const, at: trip.at, trip })),
    ...localBuilders.map((builder) => ({ kind: "builder" as const, at: builder.at, builder })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 12);
  const tile = boardWidth > 0 ? Math.floor((boardWidth - 16) / 3) : 0;
  const tileH = tile > 0 ? Math.round(tile * 0.92) : 0;
  const pickedJob = detail?.kind === "job" ? jobs.find((job) => job.id === detail.id) ?? null : null;
  const pickedTrip = detail?.kind === "trip" ? trips.find((trip) => trip.id === detail.id) ?? null : null;

  useEffect(() => {
    if (!detail) return;
    const alive = detail.kind === "job" ? jobs.some((job) => job.id === detail.id) : trips.some((trip) => trip.id === detail.id);
    if (!alive) setDetail(null);
  }, [detail, jobs, trips]);

  const nestedApp = gate === "sender" && account?.role === "sender";
  const pickingService =
    gate !== null || feed === "food" || feed === "builder" || feed === "jobs" || (feed === "trips" && tripDoor === "gate");

  useEffect(() => {
    onChrome?.(Boolean(account) && !pickingService && !nestedApp);
  }, [account, nestedApp, onChrome, pickingService]);

  if (gate === "sender") {
    if (account?.role === "sender") return <SenderApp onBack={() => setGate(null)} />;
    return <RegisterScreen role="sender" onBack={() => setGate(null)} />;
  }
  if (gate === "rider") {
    return <IntercityScreen start="rider" pane="post" onBack={() => setGate(null)} onNeedAccount={onProfile} />;
  }
  if (feed === "trips" && tripDoor === "gate") {
    return <TripEntry onBack={() => setFeed("all")} onRider={() => setGate("rider")} />;
  }
  if (feed === "food") {
    return <FoodScreen onBack={() => setFeed("all")} onNeedAccount={onProfile} />;
  }
  if (feed === "builder") {
    return <BuildScreen onBack={() => setFeed("all")} onNeedAccount={onProfile} />;
  }
  if (feed === "jobs") {
    return (
      <DeliveryEntry
        jobs={localJobs}
        onBack={() => {
          setDetail(null);
          setFeed("all");
        }}
        onOrder={() => setGate("sender")}
        onOpenJob={(id) => openDetail({ kind: "job", id })}
      >
        {pickedJob ? <JobSheet job={pickedJob} onClose={() => setDetail(null)} /> : null}
      </DeliveryEntry>
    );
  }

  return (
    <Screen compact surface="bg-[#171717]">
      <StatusBar style="light" />
      <View className="px-5 pb-6 pt-1">
        <View className="flex-row items-center">
          <BrandMark size={52} />
          <View className="ml-2.5 min-w-0 flex-1">
            <Text className="text-xl font-bold text-white" numberOfLines={1}>
              Express Go
            </Text>
            <Text className="text-xs font-semibold text-[#FF8A00]" numberOfLines={2}>
              {t("welcome.slogan")}
            </Text>
          </View>
          <View className="self-start">
            <LanguageSwitch light compact />
          </View>
          <Pressable
            onPress={onProfile}
            accessibilityRole="button"
            accessibilityLabel={t("nav.profile")}
            className="ml-2 h-10 w-10 items-center justify-center"
          >
            <Ionicons name="person-circle-outline" size={28} color="#FFFFFF" />
          </Pressable>
        </View>
        <Pressable onPress={area.openPicker} accessibilityRole="button" className="mt-3 flex-row items-center self-start">
          <Ionicons name="location" size={16} color="#FF8A00" />
          <Text className="ml-1.5 text-sm font-semibold text-white">
            {area.place ? t("area.here", { name: area.place.name, region: area.place.region }) : t("area.pick")}
          </Text>
        </Pressable>
        {!area.place ? <Text className="mt-1 text-xs leading-4 text-[#A3A3A3]">{area.denied ? t("area.denied") : t("area.need")}</Text> : null}

        <View
          className="mt-3.5"
          onLayout={(event) => {
            const next = Math.floor(event.nativeEvent.layout.width);
            setBoardWidth((prev) => (prev === next ? prev : next));
          }}
        >
          {tile > 0 ? (
            <>
              <View className="flex-row" style={{ gap: 8 }}>
                <ServiceTile art={homeArt.food} label={t("home.food")} width={tile} height={tileH} onPress={() => pickFeed("food")} />
                <ServiceTile art={homeArt.barber} label={t("city.tile_barber")} width={tile} height={tileH} onPress={() => pickFeed("barber")} />
                <ServiceTile art={homeArt.build} label={t("city.tile_builder")} width={tile} height={tileH} onPress={() => pickFeed("builder")} />
              </View>
              <View className="mt-2 flex-row" style={{ gap: 8 }}>
                <ServiceTile art={homeArt.bus} label={t("city.tile_trip")} width={tile} height={tileH} onPress={() => pickFeed("trips")} />
                <ServiceTile
                  art={homeArt.scooter}
                  label={t("city.tile_delivery")}
                  width={tile * 2 + 8}
                  height={tileH}
                  wide
                  onPress={() => pickFeed("jobs")}
                />
              </View>
            </>
          ) : null}
        </View>

        {pickedJob ? (
          <JobSheet job={pickedJob} onClose={() => setDetail(null)} />
        ) : pickedTrip ? (
          <TripSheet trip={pickedTrip} onClose={() => setDetail(null)} />
        ) : feed === "all" ? (
          <>
            <View className="mt-5 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-white">{t("trip.live")}</Text>
              <Text className="text-sm font-semibold text-[#FF8A00]">{t("home.see_all")} →</Text>
            </View>
            {booting && city.length === 0 ? (
              <View className="mt-6 items-center">
                <ActivityIndicator color="#FF8A00" />
              </View>
            ) : city.length === 0 ? (
              <View className="mt-3 items-center rounded-3xl bg-[#242424] px-5 py-8">
                <Ionicons name="megaphone-outline" size={28} color="#FF8A00" />
                <Text className="mt-3 text-center text-base font-semibold text-white">{t("city.all_empty")}</Text>
                <Text className="mt-1 text-center text-sm leading-5 text-[#A3A3A3]">{t("city.all_hint")}</Text>
              </View>
            ) : (
              city.map((card) =>
                card.kind === "job" ? (
                  <HomeAd
                    key={`job-${card.job.id}`}
                    art={homeArt.scooter}
                    kicker={t("city.tile_delivery")}
                    title={`${card.job.pickup} → ${card.job.dropoff}`}
                    body={`${card.job.item} · ${VEHICLE_LABEL[card.job.vehicle]}`}
                    place={card.job.pickup}
                    money={formatMoney(card.job.deliveryFee)}
                    onPress={() => openDetail({ kind: "job", id: card.job.id })}
                  />
                ) : card.kind === "trip" ? (
                  <HomeAd
                    key={`trip-${card.trip.id}`}
                    art={homeArt.bus}
                    kicker={card.trip.offer === "driver" ? t("trip.driver") : t("trip.rider")}
                    title={`${card.trip.from} → ${card.trip.to}`}
                    body={`${card.trip.whenLabel} · ${t("trip.seats")}: ${card.trip.seats}`}
                    place={card.trip.vehicle ? `${card.trip.from} · ${card.trip.vehicle}` : card.trip.from}
                    money={card.trip.price > 0 ? formatMoney(card.trip.price) : t("trip.deal")}
                    portrait={card.trip.photo}
                    onPress={() => openDetail({ kind: "trip", id: card.trip.id })}
                  />
                ) : (
                  <HomeAd
                    key={`builder-${card.builder.id}`}
                    art={homeArt.build}
                    kicker={t("city.tile_builder")}
                    title={tradeName(t, card.builder.trade) || card.builder.name}
                    body={card.builder.text}
                    place={[card.builder.region, card.builder.area].filter(Boolean).join(", ")}
                    money={builderMoney(t, card.builder)}
                    onPress={() => pickFeed("builder")}
                  />
                ),
              )
            )}
          </>
        ) : feed === "barber" ? (
          <>
            <Pressable
              onPress={() => setBarberAsk(true)}
              accessibilityRole="button"
              className="mt-5 items-center rounded-full bg-[#1047C4] py-3.5 active:opacity-90"
            >
              <Text className="text-base font-bold text-white">{t("city.barber_book")}</Text>
            </Pressable>
            <View className="mt-3 rounded-3xl bg-white px-5 py-6">
              <Text className="text-base font-semibold text-ink">{barberAsk ? t("city.food_empty") : t("city.barber_empty")}</Text>
              {barberAsk ? null : <Text className="mt-2 text-sm text-muted">{t("city.barber_hint")}</Text>}
            </View>
          </>
        ) : (
          <>
            <Pressable onPress={() => setTripDoor("gate")} accessibilityRole="button" className="mt-4 flex-row items-center self-start">
              <Ionicons name="chevron-back" size={18} color="#C2410C" />
              <Text className="ml-1 text-sm font-semibold text-[#C2410C]">{t("trip.back")}</Text>
            </Pressable>
            <Pressable
              onPress={() => setGate("rider")}
              accessibilityRole="button"
              className="mt-3 items-center rounded-full bg-[#1290F9] py-3.5 active:opacity-90"
            >
              <Text className="text-base font-bold text-white">{t("city.rider")}</Text>
            </Pressable>
            {trips.length === 0 ? (
              <View className="mt-3 rounded-3xl bg-white px-5 py-6">
                <Text className="text-base font-semibold text-ink">{t("city.trips_empty")}</Text>
              </View>
            ) : (
              trips.map((trip) => (
                <Pressable
                  key={trip.id}
                  onPress={() => openDetail({ kind: "trip", id: trip.id })}
                  accessibilityRole="button"
                  className="mt-3 rounded-3xl bg-[#FFF1E6] px-4 py-2.5 active:opacity-90"
                >
                  <Text className="text-base font-semibold text-ink">
                    {trip.from} → {trip.to}
                  </Text>
                  <Text className="mt-1 text-sm text-muted">{trip.whenLabel}</Text>
                  <Text className="mt-1 text-lg font-bold text-[#C2410C]">
                    {t("trip.seats")}: {trip.seats}
                  </Text>
                  <Text className="mt-2 self-end text-[21px] font-extrabold text-[#C2410C]">{trip.price > 0 ? formatMoney(trip.price) : t("trip.deal")}</Text>
                  <Text className="mt-2 text-base font-semibold text-brand">{trip.phoneMasked}</Text>
                </Pressable>
              ))
            )}
          </>
        )}

        {error ? <Text className="mt-2 text-sm text-[#F04438]">{error}</Text> : null}
      </View>
    </Screen>
  );
}

function JobSheet({ job, onClose }: { job: LiveJob; onClose: () => void }) {
  const t = useT();
  return (
    <View className="mt-5 rounded-3xl bg-[#262626] px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold text-[#FF8A00]">
          {t("city.tile_delivery")} · {statusLabel[job.status]}
        </Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("close")}>
          <Text className="text-sm font-semibold text-[#A3A3A3]">{t("close")}</Text>
        </Pressable>
      </View>
      <Text className="mt-3 text-xl font-bold text-white">{job.item}</Text>
      <DetailLine label={t("sheet.pickup")} value={job.pickup} />
      <DetailLine label={t("sheet.drop")} value={job.dropoff} />
      <DetailLine label={t("auth.vehicle")} value={VEHICLE_LABEL[job.vehicle]} />
      <Text className="mt-3 self-end text-[21px] font-extrabold text-[#FF8A00]">{formatMoney(job.deliveryFee)}</Text>
    </View>
  );
}

function TripSheet({ trip, onClose }: { trip: TripCard; onClose: () => void }) {
  const t = useT();
  return (
    <View className="mt-5 rounded-3xl bg-[#262626] px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold text-[#FF8A00]">{trip.offer === "driver" ? t("trip.driver") : t("trip.rider")}</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("close")}>
          <Text className="text-sm font-semibold text-[#A3A3A3]">{t("close")}</Text>
        </Pressable>
      </View>
      {trip.photo ? <Image source={{ uri: trip.photo }} style={{ width: 72, height: 72, borderRadius: 36, marginTop: 12 }} /> : null}
      <Text className="mt-3 text-xl font-bold text-white">
        {trip.from} → {trip.to}
      </Text>
      {trip.vehicle ? <DetailLine label={t("trip.vehicle")} value={trip.vehicle} /> : null}
      <DetailLine label={t("trip.when")} value={trip.whenLabel} />
      <Text className="mt-3 text-lg font-bold text-[#FF8A00]">
        {t("trip.seats")}: {trip.seats}
      </Text>
      <Text className="mt-3 text-base font-semibold text-brand">{trip.phoneMasked}</Text>
      {trip.note ? <Text className="mt-2 text-sm text-[#A3A3A3]">{trip.note}</Text> : null}
      <Text className="mt-3 self-end text-[21px] font-extrabold text-[#FF8A00]">{trip.price > 0 ? formatMoney(trip.price) : t("trip.deal")}</Text>
    </View>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="mt-3">
      <Text className="text-xs font-semibold text-[#A3A3A3]">{label}</Text>
      <Text className="mt-0.5 text-base font-semibold text-white">{value}</Text>
    </View>
  );
}

function tradeName(t: (key: string) => string, trade: string): string {
  if (!trade) return "";
  const key = `build.t.${trade}`;
  const label = t(key);
  return label === key ? trade : label;
}

function builderMoney(t: (key: string) => string, card: BuilderCard): string {
  if (card.payKind === "deal") return t("build.pay_deal");
  return card.price != null ? formatMoney(card.price) : "";
}

const homeArt = {
  scooter: require("../../assets/home/scooter.jpg"),
  food: require("../../assets/home/food.jpg"),
  bus: require("../../assets/home/bus.jpg"),
  build: require("../../assets/home/build.jpg"),
  barber: require("../../assets/home/barber.jpg"),
};

function HomeAd({
  art,
  kicker,
  title,
  body,
  place,
  money,
  portrait,
  onPress,
}: {
  art: number;
  kicker: string;
  title: string;
  body: string;
  place: string;
  money: string;
  portrait?: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="mt-2.5 flex-row items-center rounded-[18px] bg-[#242424] p-2.5 active:opacity-90"
    >
      <Image source={portrait ? { uri: portrait } : art} style={{ width: 62, height: 62, borderRadius: portrait ? 31 : 14 }} resizeMode="cover" />
      <View className="ml-3 min-w-0 flex-1">
        <Text className="text-xs font-semibold text-[#FF8A00]" numberOfLines={1}>
          {kicker}
        </Text>
        <Text className="mt-0.5 text-[15px] font-bold text-white" numberOfLines={1}>
          {title}
        </Text>
        {body ? (
          <Text className="mt-0.5 text-xs leading-4 text-[#A3A3A3]" numberOfLines={2}>
            {body}
          </Text>
        ) : null}
        {place ? (
          <View className="mt-1 flex-row items-center">
            <Ionicons name="location" size={12} color="#FF8A00" />
            <Text className="ml-1 flex-1 text-xs text-[#D0D0D0]" numberOfLines={1}>
              {place}
            </Text>
          </View>
        ) : null}
      </View>
      <View className="ml-2 items-end">
        {money ? <Text className="text-sm font-bold text-white">{money}</Text> : null}
        <Ionicons name="chevron-forward" size={16} color="#8A8A8A" style={{ marginTop: 6 }} />
      </View>
    </Pressable>
  );
}

function ServiceTile({
  art,
  label,
  width,
  height,
  wide = false,
  onPress,
}: {
  art: number;
  label: string;
  width: number;
  height: number;
  wide?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width, height }}
      className="overflow-hidden rounded-[18px] active:opacity-90"
    >
      <Image source={art} style={{ width, height }} resizeMode="cover" />
      <View className="absolute inset-x-0 bottom-0 px-2 pb-2.5">
        <Text
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          className={`text-center font-bold text-white ${wide ? "text-[15px]" : "text-xs"}`}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
