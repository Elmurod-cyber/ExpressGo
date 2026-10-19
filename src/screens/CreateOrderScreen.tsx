import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { MapPicker, type MapPickerHandle } from "../components/MapPicker";
import { Screen } from "../components/Screen";
import { useSession } from "../context/Session";
import { api } from "../services/api";
import { describePoint, findPlace, keepFoundPlace, kmBetween, searchPlaces, type MapPoint, type PlaceHit } from "../services/geo";
import { roadTrip } from "../services/route";
import { latinKey } from "../services/uzbekAddress";
import { formatMoney } from "../services/money";
import { editUzPhone, formatUzPhone } from "../services/phoneMask";
import { COURIER_VEHICLES, MAX_DROPOFFS, READY_SLOTS, VEHICLE_LABEL, formatReadyAt, readySlotOf, type ReadySlotId } from "../server/rules";
import type { SenderOrder, VehicleKind } from "../types";
import { BrandMark } from "../components/BrandMark";
import { useNight } from "../services/theme";

type CreateMode = "create" | "edit" | "repeat";

type CreateOrderScreenProps = {
  onDone: (sent?: boolean) => void;
  mode?: CreateMode;
  draft?: SenderOrder | null;
};

type PinMode = "pickup" | number;

type DraftStop = { label: string; point: MapPoint | null };

function localPhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("998") ? digits.slice(3) : digits;
}

function receiverPhone(raw?: string | null): string {
  return localPhoneDigits(raw ?? "").length > 0 ? formatUzPhone(raw ?? "") : "";
}

function editReceiverPhone(next: string, prev: string): string {
  if (!next.trim()) return "";
  const formatted = prev ? editUzPhone(next, prev) : formatUzPhone(next);
  return localPhoneDigits(formatted).length > 0 ? formatted : "";
}

export function CreateOrderScreen({ onDone, mode = "create", draft = null }: CreateOrderScreenProps) {
  const { account, t } = useSession();
  const night = useNight();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapPickerHandle>(null);
  const pickupPoint = useRef<MapPoint | null>(null);
  const [item, setItem] = useState(draft?.item ?? "");
  const [pickup, setPickup] = useState(draft?.pickup ?? "");
  const [stops, setStops] = useState<DraftStop[]>(() => seedStops(draft));
  const customerName = draft?.customerName ?? "";
  const [customerPhone, setCustomerPhone] = useState(receiverPhone(draft?.customerPhone));
  const [fee, setFee] = useState(draft?.deliveryFee ? String(draft.deliveryFee) : "");
  const [suggestedFee, setSuggestedFee] = useState<number | null>(null);
  const [quoteDetail, setQuoteDetail] = useState<string | null>(null);
  const [distance, setDistance] = useState("");
  const [roadEta, setRoadEta] = useState<number | null>(null);
  const [roadOk, setRoadOk] = useState(false);
  const [routeTick, setRouteTick] = useState(0);
  const [vehicle, setVehicle] = useState<VehicleKind | null>(draft?.vehicle ?? null);
  const [readySlot, setReadySlot] = useState<ReadySlotId>(draft ? readySlotOf(draft.readyAt) : "now");
  const [note, setNote] = useState(draft?.note ?? "");
  const [noteHeight, setNoteHeight] = useState(24);
  const [noteFocused, setNoteFocused] = useState(false);
  const noteRef = useRef<TextInput>(null);
  const [pin, setPin] = useState<PinMode>("pickup");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [dropFocus, setDropFocus] = useState<number | null>(null);
  const [dropHits, setDropHits] = useState<PlaceHit[]>([]);
  const [pickupHits, setPickupHits] = useState<PlaceHit[]>([]);
  const [pickupOpen, setPickupOpen] = useState(false);
  const skipPickup = useRef<string | null>(null);
  const pickupBlur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickupToken = useRef(0);
  const skipDropText = useRef<string | null>(null);
  const dropBlur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropToken = useRef(0);

  async function applyPoint(point: MapPoint, mode: PinMode = pin, keptLabel?: string) {
    const label = keptLabel ?? (await describePoint(point));
    if (mode === "pickup") {
      pickupPoint.current = point;
      setPickup(label);
    } else {
      setStops((prev) => prev.map((stop, index) => (index === mode ? { label, point } : stop)));
    }
    setRouteTick((tick) => tick + 1);
    mapRef.current?.show(point);
  }

  const dropText = dropFocus == null ? "" : (stops[dropFocus]?.label ?? "");
  const pickupBias = stops.find((stop) => stop.point)?.point ?? null;

  useEffect(() => {
    const text = pickup.trim();
    if (skipPickup.current != null && text === skipPickup.current.trim()) {
      skipPickup.current = null;
      setPickupHits([]);
      return;
    }
    if (!pickupOpen || text.length < 2) {
      setPickupHits([]);
      return;
    }
    let cancelled = false;
    const token = ++pickupToken.current;
    const timer = setTimeout(() => {
      void rankedPlaces(text, pickupBias, false).then((rows) => {
        if (!cancelled && token === pickupToken.current) setPickupHits(rows);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pickup, pickupOpen, pickupBias]);

  useEffect(() => {
    const text = dropText.trim();
    if (skipDropText.current != null && text === skipDropText.current.trim()) {
      skipDropText.current = null;
      setDropHits([]);
      return;
    }
    if (dropFocus == null || text.length < 2) {
      setDropHits([]);
      return;
    }
    let cancelled = false;
    const token = ++dropToken.current;
    const timer = setTimeout(() => {
      void rankedPlaces(text, pickupPoint.current, true).then((rows) => {
        if (!cancelled && token === dropToken.current) setDropHits(rows);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dropFocus, dropText]);

  function keepTyped(index: number) {
    const label = stops[index]?.label.trim() ?? "";
    if (label.length < 2) return;
    if (dropBlur.current) clearTimeout(dropBlur.current);
    dropToken.current += 1;
    skipDropText.current = label;
    setDropHits([]);
    setError(null);
    Keyboard.dismiss();
    setStops((prev) => prev.map((stop, i) => (i === index ? { label, point: null } : stop)));
    forgetRoute();
  }

  async function chooseDrop(hit: PlaceHit) {
    if (dropFocus == null) return;
    const index = dropFocus;
    if (dropBlur.current) clearTimeout(dropBlur.current);
    skipDropText.current = hit.label;
    setDropHits([]);
    setError(null);
    Keyboard.dismiss();
    keepFoundPlace(hit);
    if (hit.point) await applyPoint(hit.point, index, hit.label);
    else {
      setStops((prev) => prev.map((stop, i) => (i === index ? { label: hit.label, point: null } : stop)));
      forgetRoute();
    }
  }

  function keepPickupTyped() {
    const label = pickup.trim();
    if (label.length < 2) return;
    if (pickupBlur.current) clearTimeout(pickupBlur.current);
    pickupToken.current += 1;
    skipPickup.current = label;
    setPickupHits([]);
    setPickupOpen(false);
    setError(null);
    Keyboard.dismiss();
    pickupPoint.current = null;
    forgetRoute();
  }

  async function choosePickup(hit: PlaceHit) {
    if (pickupBlur.current) clearTimeout(pickupBlur.current);
    pickupToken.current += 1;
    skipPickup.current = hit.label;
    setPickupHits([]);
    setPickupOpen(false);
    setError(null);
    Keyboard.dismiss();
    keepFoundPlace(hit);
    if (hit.point) await applyPoint(hit.point, "pickup", hit.label);
    else {
      pickupPoint.current = null;
      setPickup(hit.label);
      forgetRoute();
    }
  }

  function focusDrop(index: number) {
    if (dropBlur.current) clearTimeout(dropBlur.current);
    setDropFocus(index);
    setPin(index);
  }

  function blurDrop() {
    if (dropBlur.current) clearTimeout(dropBlur.current);
    dropBlur.current = setTimeout(() => {
      setDropFocus(null);
      setDropHits([]);
    }, 250);
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
      const bias = mode === "pickup" ? stops.find((stop) => stop.point)?.point : pickupPoint.current;
      const found = await findPlace(query, bias ?? null);
      if (!found) {
        if (!silent) setError("Manzil topilmadi. Xaritadan belgilang.");
        return;
      }
      await applyPoint(found.point, mode, found.label);
    } finally {
      setFinding(false);
    }
  }

  useEffect(() => {
    const from = pickupPoint.current;
    const dests = stops.map((stop) => stop.point);
    if (!vehicle || !from || dests.some((point) => point == null)) return;
    let cancelled = false;
    void roadTrip([from, ...(dests as MapPoint[])], vehicle).then((route) => {
      if (cancelled) return;
      setDistance(String(route.km));
      setRoadEta(route.minutes);
      setRoadOk(route.road);
      if (route.line.length >= 2) mapRef.current?.showRoute(route.line);
    });
    return () => {
      cancelled = true;
    };
  }, [routeTick, vehicle, stops]);

  useEffect(() => {
    const km = Number(distance.replace(",", "."));
    if (!vehicle || !Number.isFinite(km) || km <= 0) return;
    let cancelled = false;
    void api
      .quoteFee({ distanceKm: km, vehicle })
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
  }, [distance, vehicle]);

  function forgetRoute() {
    setDistance("");
    setRoadEta(null);
    setRoadOk(false);
    setSuggestedFee(null);
    setQuoteDetail(null);
    setFee("");
    setRouteTick((tick) => tick + 1);
  }

  function clearPickup() {
    setPickup("");
    pickupPoint.current = null;
    forgetRoute();
  }

  function clearStop(index: number) {
    setStops((prev) => prev.map((stop, i) => (i === index ? { label: "", point: null } : stop)));
    forgetRoute();
  }

  async function useHere() {
    setPin("pickup");
    setError(null);
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Joylashuvga ruxsat berilmadi.");
        return;
      }
      const here = await Location.getCurrentPositionAsync({});
      const point = { lat: here.coords.latitude, lng: here.coords.longitude };
      await applyPoint(point, "pickup");
    } catch {
      setError("Turgan joy olinmadi. Manzilni yozing yoki xaritadan belgilang.");
    } finally {
      setLocating(false);
    }
  }

  useEffect(() => {
    if (!draft) return;
    if (draft.pickupLat != null && draft.pickupLng != null) {
      pickupPoint.current = { lat: draft.pickupLat, lng: draft.pickupLng };
    }
    if (pickupPoint.current) {
      setRouteTick((tick) => tick + 1);
      mapRef.current?.show(pickupPoint.current);
    }
  }, [draft]);

  async function submit() {
    if (!account) return;
    if (!vehicle) {
      setError(t("create.vehicle_need"));
      return;
    }
    if (pickup.trim().length < 2 || stops.some((stop) => stop.label.trim().length < 2)) {
      setError(t("create.address_need"));
      return;
    }
    if (localPhoneDigits(customerPhone).length < 9) {
      setError(t("create.receiver_phone_need"));
      return;
    }
    setBusy(true);
    setError(null);
    const dropoffs = stops.map((stop) => ({
      label: stop.label.trim(),
      lat: stop.point?.lat ?? null,
      lng: stop.point?.lng ?? null,
    }));
    const payload = {
      pickup,
      dropoff: dropoffs[0].label,
      item,
      deliveryFee: Number(fee),
      customerName,
      customerPhone,
      note,
      pickupLat: pickupPoint.current?.lat ?? null,
      pickupLng: pickupPoint.current?.lng ?? null,
      dropoffLat: dropoffs[0].lat,
      dropoffLng: dropoffs[0].lng,
      district: null,
      vehicle,
      readyAt: Date.now() + (READY_SLOTS.find((slot) => slot.id === readySlot)?.ms ?? 0),
      dropoffs,
    };
    try {
      if (mode === "edit" && draft) {
        await api.updateOrder(account.id, draft.id, payload);
      } else {
        await api.createOrder({ senderId: account.id, ...payload });
      }
      onDone(mode !== "edit");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : mode === "edit" ? "Saqlanmadi." : "E'lon joylanmadi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View className="px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 28) + 16 }}>
        <View className="flex-row items-center">
          <BrandMark />
        </View>

        <View className="mt-4 rounded-[28px] bg-card p-4">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-xl font-bold text-ink">
                {mode === "edit" ? t("create.edit") : mode === "repeat" ? t("create.repeat") : t("create.title")}
              </Text>
              <Text className="mt-1 text-sm text-muted">
                {mode === "edit"
                  ? t("create.edit_hint")
                  : mode === "repeat"
                    ? t("create.repeat_hint")
                    : t("create.fill")}
              </Text>
            </View>
            <Pressable onPress={() => onDone()} accessibilityRole="button" accessibilityLabel={t("close")} className="p-1">
              <Ionicons name="close" size={22} color="#667085" />
            </Pressable>
          </View>

          <View className={`mt-4 flex-row items-center rounded-2xl border px-4 ${night ? "border-[#3A3A3A] bg-[#2C2C2C]" : "border-slate-200"}`}>
            <TextInput
              value={item}
              onChangeText={setItem}
              placeholder={t("create.item_ph")}
              placeholderTextColor="#98A2B3"
              className="flex-1 bg-transparent py-3.5 text-base text-ink"
            />
            {item.trim() ? <ClearButton onPress={() => setItem("")} /> : null}
          </View>

          <AddressField
            compact
            expandOnFocus
            label={t("create.pickup")}
            value={pickup}
            onChangeText={setPickup}
            placeholder=""
            finding={finding}
            onSearch={() => void searchText(pickup, "pickup")}
            onClear={clearPickup}
            onFocus={() => {
              if (pickupBlur.current) clearTimeout(pickupBlur.current);
              setPickupOpen(true);
              setPin("pickup");
            }}
            onBlur={() => {
              if (pickupBlur.current) clearTimeout(pickupBlur.current);
              pickupBlur.current = setTimeout(() => {
                setPickupOpen(false);
                setPickupHits([]);
              }, 250);
            }}
            aside={
              <Pressable
                onPress={() => void useHere()}
                disabled={locating}
                accessibilityRole="button"
                accessibilityLabel={t("create.here")}
                className="ml-1 h-7 flex-row items-center rounded-full bg-[#12B76A] px-2.5"
              >
                {locating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <View className="mr-1 h-1.5 w-1.5 rounded-full bg-card" />
                    <Text className="text-[11px] font-semibold text-white">{t("create.here")}</Text>
                  </>
                )}
              </Pressable>
            }
          />
          {pickupOpen && pickup.trim().length >= 2 ? (
            <PlaceList
              typed={pickup.trim()}
              hits={pickupHits}
              onTyped={keepPickupTyped}
              onPick={(hit) => void choosePickup(hit)}
            />
          ) : null}
          {stops.map((stop, index) => (
            <View key={`stop-${index}`}>
              <AddressField
                compact={stops.length === 1}
                expandOnFocus={stops.length === 1}
                label={stops.length > 1 ? t("create.stop", { n: index + 1 }) : `${t("create.drop")}:`}
                value={stop.label}
                onChangeText={(value) =>
                  setStops((prev) => prev.map((item, i) => (i === index ? { ...item, label: value } : item)))
                }
                placeholder={stops.length === 1 ? "" : t("create.drop_ph")}
                finding={finding}
                onSearch={() => void searchText(stop.label, index)}
                onClear={() => clearStop(index)}
                onFocus={() => focusDrop(index)}
                onBlur={blurDrop}
                onRemove={
                  index > 0
                    ? () => {
                        setStops((prev) => prev.filter((_, i) => i !== index));
                        setPin((prev) => (prev === index ? index - 1 : prev === "pickup" ? prev : prev > index ? prev - 1 : prev));
                        setRouteTick((tick) => tick + 1);
                      }
                    : undefined
                }
              />
              {dropFocus === index && stop.label.trim().length >= 2 ? (
                <PlaceList
                  typed={stop.label.trim()}
                  hits={dropHits}
                  onTyped={() => keepTyped(index)}
                  onPick={(hit) => void chooseDrop(hit)}
                />
              ) : null}
            </View>
          ))}
          {stops.length < MAX_DROPOFFS ? (
            <Pressable
              onPress={() => {
                setStops((prev) => [...prev, { label: "", point: null }]);
                setPin(stops.length);
              }}
              accessibilityRole="button"
              className={`mt-2 self-start rounded-full px-3 py-2 ${night ? "border border-[#3A3A3A] bg-[#2C2C2C]" : "bg-slate-100"}`}
            >
              <Text className={`text-xs font-semibold ${night ? "text-[#F4F6FB]" : "text-ink"}`}>{t("create.more_stop")}</Text>
            </Pressable>
          ) : null}

          <View className="mt-4 flex-row flex-wrap items-center">
            <Chip label={t("create.pin_pick")} dark={pin === "pickup"} onPress={() => setPin("pickup")} />
            {stops.map((_, index) => (
              <Chip
                key={`pin-${index}`}
                label={stops.length > 1 ? t("create.pin_stop", { n: index + 1 }) : t("create.pin_drop")}
                dark={pin === index}
                onPress={() => setPin(index)}
              />
            ))}
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
                      : typeof pin === "number" && stops.length > 1
                        ? t("create.pin_drop_n", { n: pin + 1 })
                        : t("create.pin_drop_hint")}
                </Text>
              </View>
            </View>
          </View>

          <Text className="mt-4 text-xs text-muted">{t("create.vehicle")}</Text>
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

          <LabeledBox
            icon="call-outline"
            label={`${t("create.receiver_phone")}:`}
            value={customerPhone}
            onChangeText={(value) => setCustomerPhone((prev) => editReceiverPhone(value, prev))}
            keyboardType="phone-pad"
          />
          <LabeledBox
            icon="document-text-outline"
            label={`${t("create.price")}:`}
            value={fee}
            onChangeText={(value) => setFee(value.replace(/\D/g, ""))}
            keyboardType="number-pad"
          />
          {suggestedFee != null ? (
            <Text className="mt-2 text-xs leading-5 text-muted">
              {t("create.quote", { money: formatMoney(suggestedFee) })}
              {quoteDetail ? ` · ${quoteDetail}` : ""}
              {roadEta != null ? t("create.min", { n: roadEta }) : ""}
              {roadOk ? t("create.road") : t("create.line")}
              {t("create.can_edit")}
              {Number(fee) > 0 && suggestedFee !== Number(fee) ? t("create.you_set", { money: formatMoney(Number(fee)) }) : ""}.
            </Text>
          ) : null}
          <LabeledBox
            icon="navigate-outline"
            label={`${t("create.km")}:`}
            value={distance}
            keyboardType="decimal-pad"
            editable={false}
          />

          <View className={`mt-3 rounded-2xl border px-3 py-2 ${night ? "border-[#3A3A3A] bg-[#2C2C2C]" : "border-slate-200"}`}>
            <View className="flex-row items-start">
              <View className="min-w-0 flex-1">
                {noteFocused || note.trim().length > 0 ? null : (
                  <Pressable onPress={() => noteRef.current?.focus()} accessibilityRole="button" className="flex-row items-center">
                    <Ionicons name="cube-outline" size={14} color="#98A2B3" />
                    <Text className="ml-1 text-xs font-medium text-muted">{t("create.note")}</Text>
                  </Pressable>
                )}
                <TextInput
                  ref={noteRef}
                  value={note}
                  onChangeText={setNote}
                  placeholder={noteFocused ? "" : t("create.note_ph")}
                  placeholderTextColor="#98A2B3"
                  multiline
                  scrollEnabled={false}
                  accessibilityLabel={t("create.note")}
                  onFocus={() => setNoteFocused(true)}
                  onBlur={() => setNoteFocused(false)}
                  onContentSizeChange={(event) => {
                    const next = Math.ceil(event.nativeEvent.contentSize.height);
                    setNoteHeight((prev) => (Math.abs(prev - next) > 1 ? Math.max(24, next) : prev));
                  }}
                  style={{ height: noteHeight }}
                  className="bg-transparent py-1 text-base text-ink"
                />
              </View>
              {note.trim() ? (
                <ClearButton
                  onPress={() => {
                    setNote("");
                    setNoteHeight(24);
                  }}
                />
              ) : null}
            </View>
          </View>

          {error ? <Text className="mt-3 text-sm text-red-600">{error}</Text> : null}

          <View className="mt-4 flex-row">
            <Pressable
              onPress={() => onDone()}
              accessibilityRole="button"
              className={`mr-2 flex-1 items-center rounded-2xl border py-3.5 ${night ? "border-[#3A3A3A]" : "border-slate-200"}`}
            >
              <Text className="text-base font-semibold text-ink">{t("cancel")}</Text>
            </Pressable>
            <Pressable
              onPress={() => void submit()}
              disabled={busy}
              accessibilityRole="button"
              className={`ml-2 flex-1 items-center rounded-2xl py-3.5 active:opacity-90 ${night ? "bg-[#FF8A00]" : "bg-[#121212]"}`}
            >
              <Text className={`text-base font-semibold ${night ? "text-[#171717]" : "text-white"}`}>
                {busy
                  ? t("auth.wait")
                  : mode === "edit"
                    ? t("create.save")
                    : mode === "repeat"
                      ? t("create.repeat")
                      : t("create.send")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Screen>
  );
}

function seedStops(draft: SenderOrder | null): DraftStop[] {
  if (draft?.dropoffs?.length) {
    return draft.dropoffs.map((stop) => ({
      label: stop.label,
      point: { lat: stop.lat, lng: stop.lng },
    }));
  }
  if (draft?.dropoff) {
    return draft.dropoff.split(" → ").map((label, index) => ({
      label,
      point:
        index === 0 && draft.dropoffLat != null && draft.dropoffLng != null
          ? { lat: draft.dropoffLat, lng: draft.dropoffLng }
          : null,
    }));
  }
  return [{ label: "", point: null }];
}

function AddressField({
  label,
  value,
  onChangeText,
  placeholder,
  finding,
  onSearch,
  onClear,
  onRemove,
  onFocus,
  onBlur,
  aside,
  compact = false,
  expandOnFocus = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  finding: boolean;
  onSearch: () => void;
  onClear?: () => void;
  onRemove?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  aside?: ReactNode;
  compact?: boolean;
  expandOnFocus?: boolean;
}) {
  const { t } = useSession();
  const night = useNight();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const writing = expandOnFocus && (focused || value.trim().length > 0);
  const frame = night ? "border border-[#3A3A3A] bg-[#2C2C2C]" : "border border-slate-200";
  const searchColor = night ? "#F4F6FB" : "#121212";
  const clear = value.trim() ? (
    <ClearButton onPress={() => (onClear ? onClear() : onChangeText(""))} />
  ) : null;
  if (compact) {
    return (
      <View className={`mt-3 w-full flex-row items-center rounded-2xl px-3 py-1 ${frame}`}>
        {writing ? null : (
          <Pressable
            onPress={() => inputRef.current?.focus()}
            accessibilityRole="button"
            className="flex-row items-center"
          >
            <Ionicons name="location-sharp" size={14} color="#98A2B3" />
            <Text className="ml-1 text-xs font-medium text-muted">{label}</Text>
          </Pressable>
        )}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#98A2B3"
          returnKeyType="search"
          onSubmitEditing={onSearch}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          accessibilityLabel={label}
          className="ml-1 min-w-0 flex-1 bg-transparent py-1 text-base text-ink"
        />
        {clear}
        {aside ?? (
          <Pressable
            onPress={onSearch}
            disabled={finding}
            accessibilityRole="button"
            accessibilityLabel={`${label}ni qidirish`}
            className="h-8 w-8 items-center justify-center"
          >
            {finding ? <ActivityIndicator size="small" color="#98A2B3" /> : <Ionicons name="search" size={16} color={searchColor} />}
          </Pressable>
        )}
      </View>
    );
  }
  return (
    <View className={`mt-3 rounded-2xl px-3 py-2.5 ${frame}`}>
      <View className="flex-row items-center">
        <Ionicons name="location-sharp" size={14} color="#98A2B3" />
        <Text className="ml-1 flex-1 text-xs font-medium text-muted">{label}</Text>
        {onRemove ? (
          <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={t("create.remove")}>
            <Text className="text-xs font-semibold text-red-600">{t("create.remove")}</Text>
          </Pressable>
        ) : null}
      </View>
      <View className="flex-row items-center">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#98A2B3"
          returnKeyType="search"
          onSubmitEditing={onSearch}
          onFocus={onFocus}
          onBlur={onBlur}
          accessibilityLabel={label}
          className="flex-1 bg-transparent py-1.5 text-base text-ink"
        />
        {clear}
        <Pressable
          onPress={onSearch}
          disabled={finding}
          accessibilityRole="button"
          accessibilityLabel={`${label}ni qidirish`}
          className="h-10 w-10 items-center justify-center"
        >
          {finding ? <ActivityIndicator size="small" color="#98A2B3" /> : <Ionicons name="search" size={18} color={searchColor} />}
        </Pressable>
      </View>
    </View>
  );
}

async function rankedPlaces(text: string, bias: MapPoint | null, nearby: boolean): Promise<PlaceHit[]> {
  const [local, popular] = await Promise.all([
    searchPlaces(text, bias, nearby),
    api.suggestAddresses(text).catch(() => []),
  ]);
  const used: PlaceHit[] = popular.map((row) => ({
    point: row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null,
    label: row.label,
    source: "used",
    km: bias && row.lat != null && row.lng != null ? kmBetween({ lat: row.lat, lng: row.lng }, bias) : null,
  }));
  const usedKeys = new Set(used.map((item) => latinKey(item.label)));
  const rest = local.filter((row) => !usedKeys.has(latinKey(row.label)));
  return [...used, ...rest].slice(0, 8);
}

function placeCaption(hit: PlaceHit, t: (key: string) => string): string {
  const base = hit.source === "used" ? t("create.used") : hit.source === "own" ? t("create.search_own") : t("create.search_map");
  if (hit.km == null || !Number.isFinite(hit.km)) return base;
  const km = hit.km < 10 ? hit.km.toFixed(1) : String(Math.round(hit.km));
  return `${base} · ${km} km`;
}

function PlaceList({
  hits,
  typed,
  onTyped,
  onPick,
}: {
  hits: PlaceHit[];
  typed?: string;
  onTyped?: () => void;
  onPick: (hit: PlaceHit) => void;
}) {
  const { t } = useSession();
  const night = useNight();
  const line = night ? "border-[#3A3A3A]" : "border-slate-200";
  return (
    <View className={`mt-2 overflow-hidden rounded-2xl border bg-card ${line}`}>
      {typed && onTyped ? (
        <Pressable
          onPressIn={onTyped}
          accessibilityRole="button"
          className="flex-row items-center px-4 py-3"
        >
          <Ionicons name="create-outline" size={16} color="#155EEF" />
          <View className="ml-3 flex-1">
            <Text className="text-sm text-ink" numberOfLines={1}>
              {typed}
            </Text>
            <Text className="text-xs text-muted">{t("create.search_typed")}</Text>
          </View>
        </Pressable>
      ) : null}
      {hits.map((hit, index) => (
        <Pressable
          key={`${hit.source}-${hit.label}-${index}`}
          onPressIn={() => onPick(hit)}
          accessibilityRole="button"
          className={`flex-row items-center px-4 py-3 ${typed || index > 0 ? `border-t ${line}` : ""}`}
        >
          <Ionicons
            name={hit.source === "used" ? "star" : hit.source === "own" ? "bookmark" : "location-outline"}
            size={16}
            color={hit.source === "used" ? "#FF8A00" : hit.source === "own" ? "#155EEF" : "#667085"}
          />
          <View className="ml-3 flex-1">
            <Text className="text-sm text-ink" numberOfLines={1}>
              {hit.label}
            </Text>
            <Text className="text-xs text-muted">{placeCaption(hit, t)}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function LabeledBox({
  icon,
  label,
  value,
  onChangeText,
  keyboardType = "default",
  editable = true,
}: {
  icon: "person-outline" | "call-outline" | "navigate-outline" | "document-text-outline";
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  keyboardType?: "default" | "phone-pad" | "number-pad" | "decimal-pad";
  editable?: boolean;
}) {
  const night = useNight();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const writing = editable && (focused || value.trim().length > 0);
  return (
    <View className={`mt-3 w-full flex-row items-center rounded-2xl border px-3 py-1 ${night ? "border-[#3A3A3A] bg-[#2C2C2C]" : editable ? "border-slate-200" : "border-slate-200 bg-[#F7F8FB]"}`}>
      {writing ? null : (
        <Pressable
          onPress={() => inputRef.current?.focus()}
          disabled={!editable}
          accessibilityRole="button"
          className="flex-row items-center"
        >
          <Ionicons name={icon} size={14} color="#98A2B3" />
          <Text className="ml-1 text-xs font-medium text-muted">{label}</Text>
        </Pressable>
      )}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder=""
        placeholderTextColor="#98A2B3"
        keyboardType={keyboardType}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        className="ml-1 min-w-0 flex-1 bg-transparent py-1 text-base text-ink"
      />
      {editable && value.trim() && onChangeText ? <ClearButton onPress={() => onChangeText("")} /> : null}
    </View>
  );
}

function ClearButton({ onPress }: { onPress: () => void }) {
  const { t } = useSession();
  const night = useNight();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("create.clear")}
      hitSlop={8}
      className={`ml-1 h-7 w-7 items-center justify-center rounded-full ${night ? "bg-[#3A3A3A]" : "bg-slate-100"}`}
    >
      <Ionicons name="close" size={14} color={night ? "#F4F6FB" : "#667085"} />
    </Pressable>
  );
}

function Chip({ label, dark, onPress }: { label: string; dark: boolean; onPress: () => void }) {
  const night = useNight();
  const face = dark
    ? night
      ? "bg-[#F4F6FB]"
      : "bg-[#121212]"
    : night
      ? "border border-[#3A3A3A] bg-[#2C2C2C]"
      : "bg-slate-100";
  const ink = dark ? (night ? "text-[#171717]" : "text-white") : night ? "text-[#F4F6FB]" : "text-ink";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: dark }}
      className={`mb-1 mr-1 rounded-full px-3 py-2 ${face}`}
    >
      <Text className={`text-xs font-semibold ${ink}`}>{label}</Text>
    </Pressable>
  );
}
