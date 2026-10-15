import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { Screen } from "../components/Screen";
import { useT } from "../context/Session";
import { PhoneCodeBox } from "../components/PhoneCodeBox";
import { api } from "../services/api";
import { formatMoney } from "../services/money";
import { editUzPhone, formatUzPhone } from "../services/phoneMask";
import { readTripProfiles, saveTripProfile, type TripProfile, type TripSide } from "../services/tripProfile";
import type { MapPoint } from "../services/distance";
import { nearestPlace, placeByName, placeGroups } from "../server/places";
import { findPlace } from "../services/geo";
import { pickAvatarPhoto } from "../services/photo";
import { TRIP_NEAR_KM } from "../server/rules";
import type { TripCard, TripPass } from "../types";

type Side = "pick" | "rider" | "driver";
type RiderPane = "home" | "post" | "mine";

export function IntercityScreen({
  onBack,
  start = "pick",
  pane = "home",
}: {
  onBack: () => void;
  start?: Side;
  pane?: RiderPane;
}) {
  const t = useT();
  const [side, setSide] = useState<Side>(start);
  const [riderPane, setRiderPane] = useState<RiderPane>(pane);
  const [editing, setEditing] = useState<TripCard | null>(null);
  const [profiles, setProfiles] = useState<Partial<Record<TripSide, TripProfile>>>({});
  const [loaded, setLoaded] = useState(false);
  const [signing, setSigning] = useState<TripSide | null>(null);
  const rider = profiles.rider ?? null;

  useEffect(() => {
    void readTripProfiles().then((saved) => {
      setProfiles(saved);
      const savedSide = start === "rider" || start === "driver" ? saved[start] : null;
      const missing = start !== "pick" && (!savedSide || (start === "rider" && !savedSide.token));
      if (missing) setSigning(start);
      setLoaded(true);
    });
  }, [start]);

  function choose(next: TripSide) {
    const saved = profiles[next];
    if (saved && (next === "driver" || saved.token)) {
      setSigning(null);
      setSide(next);
      return;
    }
    setSigning(next);
  }

  function leave() {
    if (signing) {
      setSigning(null);
      if (start === "pick") setSide("pick");
      else onBack();
      return;
    }
    if (side === "rider" && editing) {
      setEditing(null);
      setRiderPane("mine");
      return;
    }
    if (side === "rider" && riderPane !== "home") {
      setRiderPane("home");
      return;
    }
    if (side === start) onBack();
    else setSide(start);
  }

  return (
    <Screen compact>
      <View className="px-5 pt-2">
        <Pressable onPress={leave} accessibilityRole="button" className="mb-3 flex-row items-center">
          <Ionicons name="chevron-back" size={20} color="#155EEF" />
          <Text className="ml-1 text-sm font-semibold text-brand">{t("trip.back")}</Text>
        </Pressable>
        <Text className="text-2xl font-bold text-ink">{t("welcome.trip")}</Text>
        <Text className="mt-1 text-sm text-muted">{t("welcome.trip_body")}</Text>

        {side === "pick" && !signing ? (
          <View className="mt-5">
            <Choice icon="person" title={t("trip.rider")} body={t("trip.rider_body")} onPress={() => choose("rider")} />
            <Choice icon="car-sport" title={t("trip.driver")} body={t("trip.driver_body")} onPress={() => choose("driver")} />
          </View>
        ) : null}
        {signing ? (
          <TripSignUp
            role={signing}
            onDone={(profile) => {
              setProfiles((prev) => ({ ...prev, [signing]: profile }));
              setSide(signing);
              setSigning(null);
            }}
          />
        ) : null}
        {loaded && !signing && side === "rider" && rider && riderPane === "home" && !editing ? (
          <RiderHome
            onPost={() => {
              setEditing(null);
              setRiderPane("post");
            }}
            onMine={() => setRiderPane("mine")}
          />
        ) : null}
        {loaded && !signing && side === "rider" && rider && riderPane === "post" ? (
          <RiderForm
            key={editing?.id ?? "new"}
            draft={editing}
            account={rider}
            onSaved={() => {
              setEditing(null);
              setRiderPane(editing ? "mine" : "home");
            }}
          />
        ) : null}
        {loaded && !signing && side === "rider" && rider && riderPane === "mine" && !editing ? (
          <MyTrips
            account={rider}
            onEdit={(trip) => {
              setEditing(trip);
              setRiderPane("post");
            }}
          />
        ) : null}
        {loaded && !signing && side === "driver" && profiles.driver ? <DriverBoard account={profiles.driver} /> : null}
      </View>
    </Screen>
  );
}

export function TripEntry({
  onBack,
  onRider,
  onDriver,
}: {
  onBack: () => void;
  onRider: () => void;
  onDriver: () => void;
}) {
  const t = useT();
  return (
    <Screen compact>
      <View className="px-4 pt-2 pb-6">
        <Pressable onPress={onBack} accessibilityRole="button" className="mb-3 flex-row items-center self-start">
          <Ionicons name="chevron-back" size={20} color="#C2410C" />
          <Text className="ml-1 text-sm font-semibold text-[#C2410C]">{t("trip.back")}</Text>
        </Pressable>
        <View className="overflow-hidden rounded-[28px] bg-[#121212]">
          <Image
            source={require("../../assets/trip/trip-road.jpg")}
            style={{ width: "100%", height: 280 }}
            resizeMode="cover"
            accessibilityLabel={t("trip.entry_title")}
          />
          <View className="absolute inset-x-0 bottom-0 bg-black/55 px-5 pb-5 pt-10">
            <Text className="text-3xl font-bold text-white">{t("trip.entry_title")}</Text>
            <Text className="mt-2 text-base leading-6 text-white">{t("trip.entry_body")}</Text>
          </View>
        </View>
        <Pressable
          onPress={onRider}
          accessibilityRole="button"
          className="mt-5 flex-row items-center justify-center rounded-full bg-[#C2410C] py-4 active:opacity-90"
        >
          <Ionicons name="person" size={20} color="#FFFFFF" />
          <Text className="ml-2 text-base font-bold text-white">{t("city.rider")}</Text>
        </Pressable>
        <Pressable
          onPress={onDriver}
          accessibilityRole="button"
          className="mt-3 flex-row items-center justify-center rounded-full border border-[#121212] bg-[#121212] py-4 active:opacity-90"
        >
          <Ionicons name="car-sport" size={20} color="#FFFFFF" />
          <Text className="ml-2 text-base font-bold text-white">{t("trip.driver_btn")}</Text>
        </Pressable>
        <LiveTrips />
      </View>
    </Screen>
  );
}

function RiderHome({ onPost, onMine }: { onPost: () => void; onMine: () => void }) {
  const t = useT();
  return (
    <View className="mt-5">
      <Pressable onPress={onPost} accessibilityRole="button" className="mb-2 items-center rounded-full bg-[#1290F9] py-3.5 active:opacity-90">
        <Text className="text-base font-bold text-white">{t("trip.hub_post")}</Text>
      </Pressable>
      <Pressable onPress={onMine} accessibilityRole="button" className="items-center rounded-full bg-[#121212] py-3.5 active:opacity-90">
        <Text className="text-base font-bold text-white">{t("trip.my")}</Text>
      </Pressable>
      <LiveTrips />
    </View>
  );
}

function Choice({
  icon,
  title,
  body,
  onPress,
}: {
  icon: "person" | "car-sport";
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="mb-2 flex-row items-center rounded-3xl bg-white p-3.5 active:opacity-90">
      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft">
        <Ionicons name={icon} size={24} color="#155EEF" />
      </View>
      <View className="ml-4 flex-1">
        <Text className="text-base font-semibold text-ink">{title}</Text>
        <Text className="mt-0.5 text-sm text-muted">{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#98A2B3" />
    </Pressable>
  );
}

function pointOfPlace(name: string): MapPoint | null {
  const place = placeByName(name);
  return place ? { lat: place.lat, lng: place.lng } : null;
}

function TripSignUp({ role, onDone }: { role: TripSide; onDone: (profile: TripProfile) => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(formatUzPhone(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (role === "rider") {
    return (
      <PhoneCodeBox
        kind="rider"
        title={t("trip.rider")}
        hint={t("trip.sms_hint")}
        onVerified={async (pass) => {
          const account = await api.registerTripAccount("rider", pass.name, pass.phone, pass.token);
          const profile = { id: account.id, name: account.name, phone: formatUzPhone(account.phone), token: pass.token };
          await saveTripProfile("rider", profile);
          onDone(profile);
        }}
      />
    );
  }

  async function submit() {
    const digits = phone.replace(/\D/g, "");
    if (name.trim().length < 2 || digits.length < 12) {
      setError(t("trip.register_hint"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const account = await api.registerTripAccount(role, name.trim(), phone);
      const profile = { id: account.id, name: account.name, phone: formatUzPhone(account.phone) };
      await saveTripProfile(role, profile);
      onDone(profile);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mt-4">
      <Text className="text-base font-bold text-ink">{role === "driver" ? t("trip.driver") : t("trip.rider")}</Text>
      <Text className="mt-1 text-sm text-muted">{t("trip.register_hint")}</Text>
      <Field label={t("auth.name")} value={name} onChange={setName} placeholder={t("auth.name_ph")} />
      <Field label={t("auth.phone")} value={phone} onChange={(value) => setPhone((prev) => editUzPhone(value, prev))} placeholder="+998" keyboard="phone-pad" />
      {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}
      <Pressable
        onPress={() => void submit()}
        disabled={busy}
        accessibilityRole="button"
        className={`mt-3 items-center rounded-2xl py-3 ${busy ? "bg-slate-200" : "bg-brand active:opacity-90"}`}
      >
        <Text className={`text-base font-bold ${busy ? "text-slate-500" : "text-white"}`}>{t("trip.register")}</Text>
      </Pressable>
    </View>
  );
}

function RiderForm({
  draft = null,
  account,
  driver = false,
  onSaved,
}: {
  draft?: TripCard | null;
  account: TripProfile;
  driver?: boolean;
  onSaved?: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(draft?.passengerName || account.name);
  const phone = account.phone;
  const [fromName, setFromName] = useState(draft?.from ?? "Shahrixon");
  const [toName, setToName] = useState(draft?.to ?? "Toshkent");
  const [fromPoint, setFromPoint] = useState<MapPoint | null>(
    draft?.fromLat != null && draft.fromLng != null ? { lat: draft.fromLat, lng: draft.fromLng } : pointOfPlace(draft?.from ?? "Shahrixon"),
  );
  const [toPoint, setToPoint] = useState<MapPoint | null>(
    draft?.toLat != null && draft.toLng != null ? { lat: draft.toLat, lng: draft.toLng } : pointOfPlace(draft?.to ?? "Toshkent"),
  );
  const [hereName, setHereName] = useState<string | null>(null);
  const [whenLabel, setWhenLabel] = useState(draft?.whenLabel ?? "");
  const [seats, setSeats] = useState(draft?.seats ?? 1);
  const [price, setPrice] = useState(draft && draft.price > 0 ? String(draft.price) : "");
  const [note, setNote] = useState(draft?.note ?? "");
  const [vehicle, setVehicle] = useState(draft?.vehicle ?? "");
  const [photo, setPhoto] = useState<string | null>(draft?.photo ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(which: "from" | "to", placeName: string, point: MapPoint | null) {
    if (!point) return;
    if (which === "from") {
      setFromName(placeName);
      setFromPoint(point);
      setHereName(null);
    } else {
      setToName(placeName);
      setToPoint(point);
    }
  }

  async function useHere() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError(t("trip.gps_off"));
        return;
      }
      const here = await Location.getCurrentPositionAsync({});
      const point = { lat: here.coords.latitude, lng: here.coords.longitude };
      const near = nearestPlace(point);
      setFromName(near.place.name);
      setFromPoint(point);
      setHereName(near.place.name);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("trip.gps_off"));
    }
  }

  async function post() {
    if (!fromPoint || !toPoint) {
      setError(t("trip.gps_off"));
      return;
    }
    setBusy(true);
    setError(null);
    let saved = false;
    try {
      const payload = {
        name,
        phone,
        from: fromName,
        to: toName,
        fromLat: fromPoint.lat,
        fromLng: fromPoint.lng,
        toLat: toPoint.lat,
        toLng: toPoint.lng,
        whenLabel,
        seats,
        price: Number(price.replace(/\s/g, "")) || 0,
        note,
        vehicle: driver ? vehicle : "",
        photo: driver ? photo : null,
        accountId: account.id,
      };
      if (draft) await api.updateTrip(draft.id, account.id, payload);
      else await api.postTrip(payload);
      saved = true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    } finally {
      setBusy(false);
    }
    if (saved) onSaved?.();
  }

  return (
    <View className="mt-3">
      <Field compact label={t("auth.name")} value={name} onChange={setName} placeholder={t("auth.name_ph")} />
      <Text className="mb-1.5 mt-2 text-sm font-medium text-ink">{t("auth.phone")}</Text>
      <Text className="rounded-2xl bg-white px-4 py-3 text-base text-ink">{phone}</Text>
      <PlacePick compact label={t("trip.from")} value={fromName} onChange={(place, point) => choose("from", place, point)} onHere={() => void useHere()} />
      {hereName ? <Text className="mt-1 text-xs font-semibold text-brand">{t("trip.here_on", { place: hereName })}</Text> : null}
      <PlacePick compact label={t("trip.to")} value={toName} onChange={(place, point) => choose("to", place, point)} />
      <Field compact label={t("trip.when")} value={whenLabel} onChange={setWhenLabel} placeholder={t("trip.when_ph")} />
      <Text className="mb-1.5 mt-2 text-sm font-medium text-ink">{t("trip.seats")}</Text>
      <View className="flex-row">
        {[1, 2, 3, 4].map((n) => (
          <Pressable
            key={n}
            onPress={() => setSeats(n)}
            accessibilityRole="button"
            className={`mr-2 h-10 w-10 items-center justify-center rounded-xl ${seats === n ? "bg-brand" : "bg-white"}`}
          >
            <Text className={`text-base font-bold ${seats === n ? "text-white" : "text-ink"}`}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <Field compact label={t("trip.price")} value={price} onChange={setPrice} placeholder={t("trip.deal")} keyboard="number-pad" />
      <Text className="mt-1 text-xs text-muted">{t("trip.price_hint")}</Text>
      {driver ? (
        <>
          <Field compact label={t("trip.vehicle")} value={vehicle} onChange={setVehicle} placeholder={t("trip.vehicle_ph")} />
          <Pressable
            onPress={() => {
              void pickAvatarPhoto()
                .then((next) => {
                  if (next) setPhoto(next);
                })
                .catch((caught: unknown) => {
                  setError(caught instanceof Error ? caught.message : t("fail.generic"));
                });
            }}
            accessibilityRole="button"
            className="mt-3 flex-row items-center"
          >
            {photo ? (
              <Image source={{ uri: photo }} style={{ width: 72, height: 72, borderRadius: 36 }} />
            ) : (
              <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-white">
                <Ionicons name="camera" size={22} color="#155EEF" />
              </View>
            )}
            <Text className="ml-3 flex-1 text-sm font-semibold text-brand">{photo ? t("trip.photo_change") : t("trip.photo_add")}</Text>
          </Pressable>
          <Text className="mt-1 text-xs text-muted">{t("trip.photo_hint")}</Text>
        </>
      ) : null}
      <Field compact label={t("trip.note")} value={note} onChange={setNote} placeholder={t("trip.note_ph")} />
      {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}
      <Pressable
        onPress={() => void post()}
        disabled={busy}
        accessibilityRole="button"
        className={`mt-3 items-center rounded-2xl py-3 ${busy ? "bg-slate-200" : "bg-brand active:opacity-90"}`}
      >
        <Text className={`text-base font-bold ${busy ? "text-slate-500" : "text-white"}`}>{draft ? t("trip.save") : t("trip.post")}</Text>
      </Pressable>
      <LiveTrips />
    </View>
  );
}

function MyTrips({
  account,
  onEdit,
}: {
  account: TripProfile;
  onEdit: (trip: TripCard) => void;
}) {
  const t = useT();
  const [rows, setRows] = useState<TripCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.listMyTrips(account.id));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    }
  }, [account.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.deleteTrip(id, account.id);
      setConfirmId(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mt-4">
      <Text className="text-base font-bold text-ink">{t("trip.my")}</Text>
      <Text className="mt-1 text-sm text-muted">{t("trip.mine_hint")}</Text>
      <Text className="mt-2 text-sm font-semibold text-ink">{account.phone}</Text>
      {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}
      {rows.length === 0 && !error ? <Text className="mt-4 text-sm text-muted">{t("trip.mine_empty")}</Text> : null}
      {rows.map((trip) => (
        <View key={trip.id} className="mt-3 rounded-3xl bg-[#FFF1E6] px-4 py-2.5">
          <View className="flex-row items-center">
            {trip.photo ? <Image source={{ uri: trip.photo }} style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12 }} /> : null}
            <Text className="flex-1 text-base font-bold text-ink">
              {trip.from} → {trip.to}
            </Text>
          </View>
          <Text className="mt-1 text-sm text-muted">{trip.whenLabel}</Text>
          {trip.vehicle ? <Text className="mt-1 text-sm font-semibold text-ink">{trip.vehicle}</Text> : null}
          <Text className="mt-1 text-lg font-bold text-[#C2410C]">
            {t("trip.seats")}: {trip.seats}
          </Text>
          {trip.note ? <Text className="mt-1 text-sm text-muted">{trip.note}</Text> : null}
          <Text className="mt-2 self-end text-[21px] font-extrabold text-[#C2410C]">{trip.price > 0 ? formatMoney(trip.price) : t("trip.deal")}</Text>
          {confirmId === trip.id ? (
            <View className="mt-3">
              <Text className="text-sm font-semibold text-ink">{t("trip.delete_ask")}</Text>
              <View className="mt-2 flex-row">
                <Pressable
                  onPress={() => void remove(trip.id)}
                  disabled={busy}
                  accessibilityRole="button"
                  className="mr-2 flex-1 items-center rounded-2xl bg-[#121212] py-3"
                >
                  <Text className="text-sm font-bold text-white">{t("trip.delete_yes")}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setConfirmId(null)}
                  disabled={busy}
                  accessibilityRole="button"
                  className="flex-1 items-center rounded-2xl bg-[#F8FAFC] py-3"
                >
                  <Text className="text-sm font-bold text-ink">{t("no")}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View className="mt-3 flex-row">
              <Pressable
                onPress={() => onEdit(trip)}
                accessibilityRole="button"
                className="mr-2 flex-1 items-center rounded-2xl bg-[#1290F9] py-3"
              >
                <Text className="text-sm font-bold text-white">{t("trip.edit")}</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmId(trip.id)}
                accessibilityRole="button"
                className="flex-1 items-center rounded-2xl bg-[#121212] py-3"
              >
                <Text className="text-sm font-bold text-white">{t("trip.delete")}</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function DriverBoard({ account }: { account: TripProfile }) {
  const t = useT();
  const [mode, setMode] = useState<"near" | "route">("near");
  const [here, setHere] = useState<MapPoint | null>(null);
  const [hereName, setHereName] = useState<string | null>(null);
  const [routeFrom, setRouteFrom] = useState("");
  const [routeTo, setRouteTo] = useState("Toshkent");
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [trips, setTrips] = useState<TripCard[]>([]);
  const [desk, setDesk] = useState<"browse" | "post" | "mine">("browse");
  const [editing, setEditing] = useState<TripCard | null>(null);
  const [pass, setPass] = useState<TripPass | null>(null);
  const [opened, setOpened] = useState<Record<string, { phone: string; address: string }>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function locate() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          if (!cancelled) setGpsError(t("trip.gps_off"));
          return;
        }
        const position = await Location.getCurrentPositionAsync({});
        if (cancelled) return;
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        const near = nearestPlace(point);
        setHere(point);
        setHereName(near.place.name);
        setRouteFrom(near.place.name);
        setGpsError(null);
      } catch {
        if (!cancelled) setGpsError(t("trip.gps_off"));
      }
    }
    void locate();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const load = useCallback(async () => {
    try {
      setTrips(
        await api.listTrips(
          mode === "route"
            ? { mode: "route", from: routeFrom, to: routeTo, lat: here?.lat, lng: here?.lng }
            : { mode: "near", lat: here?.lat, lng: here?.lng },
        ),
      );
      setPass(await api.tripPassStatus(account.id));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    }
  }, [mode, routeFrom, routeTo, here, account.id, t]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [load]);

  async function buy(tripId: string) {
    try {
      const next = await api.startTripPass(account.id);
      setPass(next);
      if (!tripId) return;
      const revealed = await api.revealTripPhone(tripId, account.id);
      if (revealed.ok) setOpened((prev) => ({ ...prev, [tripId]: { phone: revealed.phone, address: revealed.address } }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    }
  }

  async function openPhone(trip: TripCard) {
    try {
      const revealed = await api.revealTripPhone(trip.id, account.id);
      if (revealed.ok) {
        setOpened((prev) => ({ ...prev, [trip.id]: { phone: revealed.phone, address: revealed.address } }));
        setError(null);
        return;
      }
      Alert.alert(t("trip.pass_title"), t("trip.pass_body", { days: revealed.days, money: formatMoney(revealed.price) }), [
        { text: t("no"), style: "cancel" },
        { text: t("trip.pass_buy"), onPress: () => void buy(trip.id) },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    }
  }

  const until = pass?.active && pass.until ? dayStamp(pass.until) : "";

  if (desk === "post") {
    return (
      <View className="mt-5">
        <Pressable
          onPress={() => {
            setEditing(null);
            setDesk("browse");
          }}
          accessibilityRole="button"
          className="mb-3 flex-row items-center self-start"
        >
          <Ionicons name="chevron-back" size={18} color="#155EEF" />
          <Text className="ml-1 text-sm font-semibold text-brand">{t("trip.back")}</Text>
        </Pressable>
        <RiderForm
          key={editing?.id ?? "new"}
          draft={editing}
          driver
          account={account}
          onSaved={() => {
            setEditing(null);
            setDesk("mine");
          }}
        />
      </View>
    );
  }

  if (desk === "mine") {
    return (
      <View className="mt-5">
        <Pressable
          onPress={() => setDesk("browse")}
          accessibilityRole="button"
          className="mb-3 flex-row items-center self-start"
        >
          <Ionicons name="chevron-back" size={18} color="#155EEF" />
          <Text className="ml-1 text-sm font-semibold text-brand">{t("trip.back")}</Text>
        </Pressable>
        <MyTrips
          account={account}
          onEdit={(trip) => {
            setEditing(trip);
            setDesk("post");
          }}
        />
      </View>
    );
  }

  return (
    <View className="mt-5">
      <Text className="text-base font-bold text-ink">{account.name}</Text>
      <Text className="mt-1 text-sm text-muted">{account.phone}</Text>
      <Text className="mt-1 text-sm font-bold text-ink">{t("trip.driver_id", { id: account.id })}</Text>
      <Text className="mt-1 text-sm text-muted">{t("trip.pass_free")}</Text>
      <Text className={`mt-3 text-sm ${hereName ? "font-semibold text-brand" : "text-muted"}`}>
        {hereName ? t("trip.now", { place: hereName }) : (gpsError ?? t("trip.gps_off"))}
      </Text>
      <Text className={`mt-1 text-sm ${pass?.active ? "font-semibold text-brand" : "text-muted"}`}>
        {pass?.active ? t("trip.pass_on", { date: until }) : t("trip.pass_off")}
      </Text>
      <Pressable
        onPress={() => {
          setEditing(null);
          setDesk("post");
        }}
        accessibilityRole="button"
        className="mt-4 items-center rounded-full bg-[#1290F9] py-3.5 active:opacity-90"
      >
        <Text className="text-base font-bold text-white">{t("trip.hub_post")}</Text>
      </Pressable>
      <Pressable
        onPress={() => setDesk("mine")}
        accessibilityRole="button"
        className="mt-2 items-center rounded-full bg-white py-3.5 active:opacity-90"
      >
        <Text className="text-base font-bold text-ink">{t("trip.my")}</Text>
      </Pressable>
      {pass && !pass.active ? (
        <Pressable
          onPress={() => void buy("")}
          accessibilityRole="button"
          className="mt-3 items-center rounded-2xl bg-[#C2410C] py-3"
        >
          <Text className="text-sm font-bold text-white">{t("trip.pass_buy")} · {formatMoney(pass.price)}</Text>
        </Pressable>
      ) : null}
      <View className="mt-4 flex-row">
        <Pressable
          onPress={() => setMode("near")}
          accessibilityRole="button"
          className={`mr-2 flex-1 items-center rounded-2xl py-3 ${mode === "near" ? "bg-[#121212]" : "bg-white"}`}
        >
          <Text className={`text-sm font-semibold ${mode === "near" ? "text-white" : "text-muted"}`}>{t("trip.near")}</Text>
        </Pressable>
        <Pressable
          onPress={() => setMode("route")}
          accessibilityRole="button"
          className={`flex-1 items-center rounded-2xl py-3 ${mode === "route" ? "bg-[#121212]" : "bg-white"}`}
        >
          <Text className={`text-sm font-semibold ${mode === "route" ? "text-white" : "text-muted"}`}>{t("trip.route")}</Text>
        </Pressable>
      </View>
      {mode === "near" ? (
        <Text className="mt-2 text-xs text-muted">{t("trip.near_hint", { km: TRIP_NEAR_KM })}</Text>
      ) : (
        <>
          <PlacePick label={t("trip.from")} value={routeFrom} onChange={(place) => setRouteFrom(place)} allowAny />
          <PlacePick label={t("trip.to")} value={routeTo} onChange={(place) => setRouteTo(place)} allowAny />
        </>
      )}
      {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}
      <View className="mt-4">
        {trips.length === 0 ? (
          <View className="rounded-3xl bg-white px-5 py-8">
            <Text className="text-base font-semibold text-ink">{t("trip.empty")}</Text>
            <Text className="mt-2 text-sm text-muted">{mode === "near" && !here ? t("trip.gps_off") : t("trip.empty_hint")}</Text>
          </View>
        ) : (
          trips.map((trip) => (
            <TripRow
              key={trip.id}
              trip={trip}
              phone={opened[trip.id]?.phone}
              address={opened[trip.id]?.address}
              onPhone={() => void openPhone(trip)}
            />
          ))
        )}
      </View>
    </View>
  );
}

function LiveTrips() {
  const t = useT();
  const [trips, setTrips] = useState<TripCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTrips(await api.listTrips({ mode: "route" }));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading && trips.length === 0) {
    return (
      <View className="mt-5 items-center">
        <ActivityIndicator color="#C2410C" />
      </View>
    );
  }
  if (trips.length === 0) {
    return (
      <View className="mt-5">
        <Text className="text-base font-bold text-ink">{t("trip.live")}</Text>
        {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : <Text className="mt-2 text-sm text-muted">{t("trip.empty_hint")}</Text>}
      </View>
    );
  }

  return (
    <View className="mt-5">
      <Text className="text-base font-bold text-ink">{t("trip.live")}</Text>
      {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}
      {trips.map((trip) => (
        <TripRow key={trip.id} trip={trip} />
      ))}
    </View>
  );
}

function TripRow({
  trip,
  phone,
  address,
  onPhone,
}: {
  trip: TripCard;
  phone?: string;
  address?: string;
  onPhone?: () => void;
}) {
  const t = useT();
  return (
    <View className="mt-3 rounded-3xl bg-[#FFF1E6] px-4 py-2.5">
      <View className="flex-row items-center">
        {trip.offer === "driver" && trip.photo ? (
          <Image source={{ uri: trip.photo }} style={{ width: 56, height: 56, borderRadius: 28, marginRight: 12 }} />
        ) : null}
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-bold uppercase text-[#C2410C]">{trip.offer === "driver" ? t("trip.driver") : t("trip.rider")}</Text>
          <Text className="mt-1 text-base font-bold text-ink">
            {trip.from} → {trip.to}
          </Text>
          {trip.vehicle ? <Text className="mt-0.5 text-sm font-semibold text-ink">{trip.vehicle}</Text> : null}
        </View>
      </View>
      <Text className="mt-1 text-sm text-muted">
        {trip.passengerName} · {trip.whenLabel}
      </Text>
      {trip.km != null ? <Text className="mt-1 text-sm font-semibold text-brand">{t("trip.km", { n: trip.km })}</Text> : null}
      <Text className="mt-2 text-lg font-bold text-[#C2410C]">
        {t("trip.seats")}: {trip.seats}
      </Text>
      {address ? <Text className="mt-2 text-sm text-muted">{address}</Text> : null}
      <Pressable onPress={onPhone} disabled={!onPhone} accessibilityRole="button" className="mt-3 flex-row items-center">
        <Ionicons name="call" size={16} color="#155EEF" />
        <Text className="ml-2 text-base font-semibold text-brand">{phone ?? trip.phoneMasked}</Text>
      </Pressable>
      {!phone ? <Text className="mt-1 text-xs text-muted">{onPhone ? t("trip.open_phone") : t("trip.phone_hint")}</Text> : null}
      {trip.note ? <Text className="mt-2 text-sm text-muted">{trip.note}</Text> : null}
      <Text className="mt-2 self-end text-[21px] font-extrabold text-[#C2410C]">{trip.price > 0 ? formatMoney(trip.price) : t("trip.deal")}</Text>
    </View>
  );
}

function PlacePick({
  label,
  value,
  onChange,
  onHere,
  allowAny = false,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (name: string, point: MapPoint | null) => void;
  onHere?: () => void;
  allowAny?: boolean;
  compact?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState<string | null>(null);
  const [other, setOther] = useState(false);
  const [draft, setDraft] = useState("");
  const [miss, setMiss] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = value || (allowAny ? t("trip.any") : "");
  const cities = placeGroups().find((group) => group.region === region)?.places ?? [];

  function close() {
    setOpen(false);
    setRegion(null);
    setOther(false);
    setDraft("");
    setMiss(false);
  }

  function choose(name: string, point: MapPoint | null) {
    onChange(name, point);
    close();
  }

  async function submitOther() {
    const text = draft.trim();
    if (text.length < 2) {
      setMiss(true);
      return;
    }
    setBusy(true);
    setMiss(false);
    try {
      const found = await findPlace(text);
      if (!found) {
        setMiss(true);
        return;
      }
      choose(found.label, found.point);
    } catch {
      setMiss(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className={compact ? "mt-2" : "mt-4"}>
      <View className={`${compact ? "mb-1" : "mb-2"} flex-row items-center justify-between`}>
        <Text className="text-sm font-medium text-ink">{label}</Text>
        {onHere ? (
          <Pressable onPress={() => { close(); onHere(); }} accessibilityRole="button">
            <Text className="text-sm font-semibold text-brand">{t("trip.here")}</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={() => (open ? close() : setOpen(true))}
        accessibilityRole="button"
        className={`flex-row items-center rounded-2xl border border-line bg-white ${compact ? "px-3 py-2.5" : "px-4 py-3.5"}`}
      >
        <Text className={`flex-1 text-base ${shown ? "text-ink" : "text-muted"}`}>{shown}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color="#98A2B3" />
      </Pressable>
      {open ? (
        <View className="mt-2 rounded-2xl bg-white px-3 py-2">
          {other ? (
            <View className="py-2">
              <Pressable onPress={() => setOther(false)} accessibilityRole="button" className="mb-2 flex-row items-center">
                <Ionicons name="chevron-back" size={16} color="#155EEF" />
                <Text className="ml-1 text-sm font-semibold text-brand">{region}</Text>
              </Pressable>
              <TextInput
                value={draft}
                onChangeText={(text) => {
                  setDraft(text);
                  setMiss(false);
                }}
                placeholder={t("trip.other_ph")}
                placeholderTextColor="#98A2B3"
                className="rounded-2xl border border-line bg-canvas px-4 py-3 text-base text-ink"
              />
              {miss ? <Text className="mt-2 text-sm text-red-600">{t("trip.other_miss")}</Text> : null}
              <Pressable
                onPress={() => void submitOther()}
                disabled={busy}
                accessibilityRole="button"
                className={`mt-3 items-center rounded-2xl py-3 ${busy ? "bg-slate-200" : "bg-brand"}`}
              >
                <Text className={`text-sm font-semibold ${busy ? "text-slate-500" : "text-white"}`}>{t("trip.other_ok")}</Text>
              </Pressable>
            </View>
          ) : region ? (
            <View>
              <Pressable onPress={() => setRegion(null)} accessibilityRole="button" className="flex-row items-center py-2.5">
                <Ionicons name="chevron-back" size={16} color="#155EEF" />
                <Text className="ml-1 text-sm font-semibold text-brand">{region}</Text>
              </Pressable>
              {cities.map((place) => (
                <PlaceRow key={place.id} label={place.name} selected={value === place.name} onPress={() => choose(place.name, { lat: place.lat, lng: place.lng })} />
              ))}
              <PlaceRow label={t("trip.other")} selected={false} onPress={() => setOther(true)} />
            </View>
          ) : (
            <View>
              {allowAny ? <PlaceRow label={t("trip.any")} selected={value === ""} onPress={() => choose("", null)} /> : null}
              {placeGroups().map((group) => (
                <PlaceRow key={group.region} label={group.region} selected={false} onPress={() => setRegion(group.region)} />
              ))}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function PlaceRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="py-2">
      <Text className={`text-base ${selected ? "font-semibold text-brand" : "text-ink"}`}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  keyboard?: "phone-pad" | "number-pad";
  compact?: boolean;
}) {
  return (
    <View className={compact ? "mt-2" : "mt-4"}>
      <Text className={`${compact ? "mb-1" : "mb-2"} text-sm font-medium text-ink`}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#98A2B3"
        keyboardType={keyboard}
        className={`rounded-2xl border border-line bg-white text-base text-ink ${compact ? "px-3 py-2.5" : "px-4 py-3.5"}`}
      />
    </View>
  );
}

function dayStamp(at: number): string {
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
