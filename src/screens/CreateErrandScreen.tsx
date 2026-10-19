import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { MapPicker, type MapPickerHandle } from "../components/MapPicker";
import { SavedPlacesBar } from "../components/SavedPlacesBar";
import { Screen } from "../components/Screen";
import { api } from "../services/api";
import { describePoint, findPlace, type MapPoint } from "../services/geo";
import { roadRoute } from "../services/route";
import { formatMoney } from "../services/money";
import { editUzPhone, formatUzPhone } from "../services/phoneMask";
import { COURIER_VEHICLES, DISTRICTS, READY_SLOTS, VEHICLE_LABEL, formatReadyAt, guessDistrict, type ReadySlotId } from "../server/rules";
import type { SavedAddresses, SavedSlot, VehicleKind } from "../types";
import { useT } from "../context/Session";

type CreateErrandScreenProps = {
  onDone: (phone: string) => void;
  onBack: () => void;
};

type PinMode = "pickup" | "dropoff";

export function CreateErrandScreen({ onDone, onBack }: CreateErrandScreenProps) {
  const t = useT();
  const mapRef = useRef<MapPickerHandle>(null);
  const pickupPoint = useRef<MapPoint | null>(null);
  const dropoffPoint = useRef<MapPoint | null>(null);
  const [item, setItem] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [phone, setPhone] = useState(formatUzPhone(""));
  const [productPrice, setProductPrice] = useState("");
  const [fee, setFee] = useState("");
  const [suggestedFee, setSuggestedFee] = useState<number | null>(null);
  const [quoteDetail, setQuoteDetail] = useState<string | null>(null);
  const [distance, setDistance] = useState("");
  const [roadEta, setRoadEta] = useState<number | null>(null);
  const [roadOk, setRoadOk] = useState(false);
  const [routeTick, setRouteTick] = useState(0);
  const [district, setDistrict] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<VehicleKind>("moto");
  const [readySlot, setReadySlot] = useState<ReadySlotId>("now");
  const [pin, setPin] = useState<PinMode>("pickup");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const [places, setPlaces] = useState<SavedAddresses>({ home: null, shop: null });

  async function applyPoint(point: MapPoint, mode: PinMode = pin, keptLabel?: string) {
    const label = keptLabel ?? (await describePoint(point));
    if (mode === "pickup") {
      pickupPoint.current = point;
      setPickup(label);
      const found = guessDistrict(label);
      if (found) setDistrict(found);
    } else {
      dropoffPoint.current = point;
      setDropoff(label);
      const found = guessDistrict(label);
      if (found && !district) setDistrict(found);
    }
    if (pickupPoint.current && dropoffPoint.current) {
      setRouteTick((tick) => tick + 1);
    }
    mapRef.current?.show(point);
  }

  async function searchText(text: string, mode: PinMode, silent = false) {
    const query = text.trim();
    if (query.length < 2) {
      if (!silent) setError("Manzil yozing, keyin qidiring.");
      return;
    }
    setPin(mode);
    setFinding(true);
    setError(null);
    Keyboard.dismiss();
    try {
      const bias = mode === "pickup" ? dropoffPoint.current : pickupPoint.current;
      const found = await findPlace(query, bias);
      if (!found) {
        if (!silent) setError("Manzil topilmadi. Xaritadan belgilang.");
        return;
      }
      await applyPoint(found.point, mode, found.label);
    } finally {
      setFinding(false);
    }
  }

  function pickMahalla(name: string) {
    if (district === name) {
      setDistrict(null);
      return;
    }
    setDistrict(name);
    void searchText(name, pin, true);
  }

  useEffect(() => {
    let cancelled = false;
    void api.getSavedPlaces(null).then((next) => {
      if (!cancelled) setPlaces(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function currentSpot(): { point: MapPoint; label: string } | null {
    if (pin === "pickup") {
      if (!pickupPoint.current || pickup.trim().length < 2) return null;
      return { point: pickupPoint.current, label: pickup.trim() };
    }
    if (!dropoffPoint.current || dropoff.trim().length < 2) return null;
    return { point: dropoffPoint.current, label: dropoff.trim() };
  }

  async function applySaved(_slot: SavedSlot, place: { label: string; lat: number; lng: number }) {
    setError(null);
    await applyPoint({ lat: place.lat, lng: place.lng }, pin, place.label);
  }

  async function saveCurrent(slot: SavedSlot) {
    const spot = currentSpot();
    if (!spot) {
      setError("Avval nuqtani belgilang, keyin Uy yoki Do'kon qilib saqlang.");
      return;
    }
    setError(null);
    try {
      const next = await api.savePlace({
        userId: null,
        slot,
        label: spot.label,
        lat: spot.point.lat,
        lng: spot.point.lng,
      });
      setPlaces(next.saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Manzil saqlanmadi.");
    }
  }

  async function clearSaved(slot: SavedSlot) {
    try {
      const next = await api.clearPlace({ userId: null, slot });
      setPlaces(next.saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "O'chirilmadi.");
    }
  }

  useEffect(() => {
    const from = pickupPoint.current;
    const to = dropoffPoint.current;
    if (!from || !to) return;
    let cancelled = false;
    void roadRoute(from, to, vehicle).then((route) => {
      if (cancelled) return;
      setDistance(String(route.km));
      setRoadEta(route.minutes);
      setRoadOk(route.road);
      if (route.line.length >= 2) mapRef.current?.showRoute(route.line);
    });
    return () => {
      cancelled = true;
    };
  }, [routeTick, vehicle]);

  useEffect(() => {
    const km = Number(distance.replace(",", "."));
    if (!Number.isFinite(km) || km <= 0) return;
    let cancelled = false;
    void api
      .quoteFee({ distanceKm: km, district, vehicle })
      .then((quote) => {
        if (cancelled) return;
        setSuggestedFee(quote.fee);
        setQuoteDetail(quote.detail);
        setFee(String(quote.fee));
      })
      .catch(() => {
        // Narx keyin yoziladi.
      });
    return () => {
      cancelled = true;
    };
  }, [distance, district, vehicle]);

  async function useHere() {
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Joylashuvga ruxsat berilmadi.");
        return;
      }
      const here = await Location.getCurrentPositionAsync({});
      const point = { lat: here.coords.latitude, lng: here.coords.longitude };
      await applyPoint(point);
    } catch {
      setError("Turgan joy olinmadi. Manzilni yozing yoki xaritadan belgilang.");
    }
  }

  async function submit() {
    if (!pickupPoint.current || !dropoffPoint.current) {
      setError("Olish va yetkazish nuqtasini yozib qidiring yoki xaritadan belgilang.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createErrand({
        district: district ?? "",
        pickup,
        item,
        productPrice: Number(productPrice),
        dropoff,
        customerPhone: phone,
        courierFee: Number(fee),
        pickupLat: pickupPoint.current.lat,
        pickupLng: pickupPoint.current.lng,
        dropoffLat: dropoffPoint.current.lat,
        dropoffLng: dropoffPoint.current.lng,
        vehicle,
        readyAt: Date.now() + (READY_SLOTS.find((slot) => slot.id === readySlot)?.ms ?? 0),
      });
      onDone(phone);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Buyurtma joylanmadi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View className="px-4 pt-3">
        <Pressable onPress={onBack} accessibilityRole="button" className="self-start py-2">
          <Text className="text-sm font-semibold text-brand">{t("errand.back")}</Text>
        </Pressable>

        <View className="mt-2 rounded-[28px] bg-card p-4">
          <Text className="text-xl font-bold text-ink">{t("errand.title")}</Text>
          <Text className="mt-1 text-sm text-muted">{t("errand.body")}</Text>

          <TextInput
            value={item}
            onChangeText={setItem}
            placeholder={t("errand.item_ph")}
            placeholderTextColor="#98A2B3"
            className="mt-4 rounded-2xl border border-slate-200 px-4 py-3.5 text-base text-ink"
          />

          <AddressField
            label={t("errand.from")}
            value={pickup}
            onChangeText={setPickup}
            placeholder={t("errand.from_ph")}
            finding={finding}
            onSearch={() => void searchText(pickup, "pickup")}
          />
          <AddressField
            label={t("create.drop")}
            value={dropoff}
            onChangeText={setDropoff}
            placeholder={t("errand.drop_ph")}
            finding={finding}
            onSearch={() => void searchText(dropoff, "dropoff")}
          />

          <SavedPlacesBar
            places={places}
            onApply={(slot, place) => void applySaved(slot, place)}
            onSave={(slot) => void saveCurrent(slot)}
            onClear={(slot) => void clearSaved(slot)}
          />

          <View className="mt-4 flex-row items-center">
            <Chip label={t("create.pin_pick")} dark={pin === "pickup"} onPress={() => setPin("pickup")} />
            <Chip label={t("create.pin_drop")} dark={pin === "dropoff"} onPress={() => setPin("dropoff")} />
            <Pressable
              onPress={() => void useHere()}
              accessibilityRole="button"
              className="ml-1 flex-row items-center rounded-full bg-[#12B76A] px-3 py-2"
            >
              <View className="mr-1.5 h-2 w-2 rounded-full bg-card" />
              <Text className="text-xs font-semibold text-white">{t("create.here")}</Text>
            </Pressable>
          </View>

          <View className="relative mt-1">
            <MapPicker ref={mapRef} onPick={(point) => void applyPoint(point)} />
            <View className="absolute bottom-3 left-3 right-3 items-center" pointerEvents="none">
              <View className="rounded-full bg-[#121212]/90 px-3 py-1.5">
                <Text className="text-center text-[11px] font-medium text-white">
                  {finding
                    ? t("create.finding")
                    : pin === "pickup"
                      ? t("create.pin_pick_hint")
                      : t("create.pin_drop_hint")}
                </Text>
              </View>
            </View>
          </View>

          <Text className="mt-4 text-xs text-muted">{t("auth.vehicle")}</Text>
          <View className="mt-2 flex-row flex-wrap">
            {COURIER_VEHICLES.map((kind) => (
              <Chip
                key={kind}
                label={VEHICLE_LABEL[kind]}
                dark={vehicle === kind}
                onPress={() => setVehicle(kind)}
              />
            ))}
          </View>

          <Text className="mt-3 text-xs text-muted">{t("create.when")}</Text>
          <View className="mt-2 flex-row flex-wrap">
            {READY_SLOTS.map((slot) => (
              <Chip
                key={slot.id}
                label={slot.label}
                dark={readySlot === slot.id}
                onPress={() => setReadySlot(slot.id)}
              />
            ))}
          </View>
          {readySlot !== "now" ? (
            <Text className="mt-2 text-xs text-muted">
              {t("ready.hint", {
                time: formatReadyAt(Date.now() + (READY_SLOTS.find((slot) => slot.id === readySlot)?.ms ?? 0)),
              })}
            </Text>
          ) : null}

          <Text className="mt-3 text-xs text-muted">{t("create.mahalla")}</Text>
          <View className="mt-2 flex-row flex-wrap">
            {DISTRICTS.map((name) => (
              <Chip
                key={name}
                label={name}
                dark={district === name}
                onPress={() => pickMahalla(name)}
              />
            ))}
          </View>

          <View className="mt-4 flex-row">
            <View className="mr-2 flex-1">
              <LabeledBox
                icon="cube-outline"
                label={t("errand.goods")}
                value={productPrice}
                onChangeText={(value) => setProductPrice(value.replace(/\D/g, ""))}
                placeholder="40000"
                keyboardType="number-pad"
              />
            </View>
            <View className="ml-2 flex-1">
              <LabeledBox
                icon="call-outline"
                label={t("errand.phone")}
                value={phone}
                onChangeText={(value) => setPhone((prev) => editUzPhone(value, prev))}
                placeholder="+998"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View className="mt-3 flex-row">
            <View className="mr-2 flex-1">
              <LabeledBox
                icon="navigate-outline"
                label={t("create.km")}
                value={distance}
                placeholder={t("create.km_ph")}
                keyboardType="decimal-pad"
                editable={false}
              />
            </View>
            <View className="ml-2 flex-1">
              <LabeledBox
                icon="document-text-outline"
                label={t("errand.fee")}
                value={fee}
                onChangeText={(value) => setFee(value.replace(/\D/g, ""))}
                placeholder={t("money.som")}
                keyboardType="number-pad"
              />
            </View>
          </View>
          {suggestedFee != null ? (
            <Text className="mt-2 text-xs leading-5 text-muted">
              {t("create.quote", { money: formatMoney(suggestedFee) })}
              {quoteDetail ? ` · ${quoteDetail}` : ""}
              {roadEta != null ? t("create.min", { n: roadEta }) : ""}
              {roadOk ? t("create.road") : t("create.line")}
              {t("errand.can")}
              {Number(fee) > 0 && suggestedFee !== Number(fee) ? t("create.you_set", { money: formatMoney(Number(fee)) }) : ""}.
              {t("errand.fee_only")}
            </Text>
          ) : (
            <Text className="mt-2 text-xs text-muted">{t("errand.need_pins")}</Text>
          )}

          {error ? <Text className="mt-3 text-sm text-red-600">{error}</Text> : null}

          <View className="mt-4 flex-row">
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              className="mr-2 flex-1 items-center rounded-2xl border border-slate-200 py-3.5"
            >
              <Text className="text-base font-semibold text-ink">{t("cancel")}</Text>
            </Pressable>
            <Pressable
              onPress={() => void submit()}
              disabled={busy}
              accessibilityRole="button"
              className="ml-2 flex-1 items-center rounded-2xl bg-[#121212] py-3.5 active:opacity-90"
            >
              <Text className="text-base font-semibold text-white">
                {busy ? t("errand.posting") : t("errand.post")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Screen>
  );
}

function AddressField({
  label,
  value,
  onChangeText,
  placeholder,
  finding,
  onSearch,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  finding: boolean;
  onSearch: () => void;
}) {
  return (
    <View className="mt-3">
      <View className="mb-1.5 flex-row items-center">
        <Ionicons name="location-sharp" size={14} color="#98A2B3" />
        <Text className="ml-1 text-sm font-medium text-ink">{label}</Text>
      </View>
      <View className="flex-row items-center rounded-2xl border border-slate-200 px-2">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#98A2B3"
          returnKeyType="search"
          onSubmitEditing={onSearch}
          className="flex-1 px-2 py-3.5 text-base text-ink"
        />
        <Pressable
          onPress={onSearch}
          disabled={finding}
          accessibilityRole="button"
          accessibilityLabel={`${label}ni qidirish`}
          className="h-10 w-10 items-center justify-center"
        >
          {finding ? <ActivityIndicator size="small" color="#98A2B3" /> : <Ionicons name="search" size={18} color="#121212" />}
        </Pressable>
      </View>
    </View>
  );
}

function LabeledBox({
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  editable = true,
}: {
  icon: "cube-outline" | "call-outline" | "navigate-outline" | "document-text-outline";
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "phone-pad" | "number-pad" | "decimal-pad";
  editable?: boolean;
}) {
  return (
    <View>
      <View className="mb-1.5 flex-row items-center">
        <Ionicons name={icon} size={16} color="#98A2B3" />
        <Text className="ml-1 text-sm font-medium text-ink">{label}</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#98A2B3"
        keyboardType={keyboardType}
        editable={editable}
        className={`rounded-2xl border border-slate-200 px-4 py-3.5 text-base text-ink ${editable ? "" : "bg-[#F7F8FB]"}`}
      />
    </View>
  );
}

function Chip({ label, dark, onPress }: { label: string; dark: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: dark }}
      className={`mb-1 mr-1 rounded-full px-3 py-2 ${dark ? "bg-[#121212]" : "bg-slate-100"}`}
    >
      <Text className={`text-xs font-semibold ${dark ? "text-white" : "text-ink"}`}>{label}</Text>
    </Pressable>
  );
}
