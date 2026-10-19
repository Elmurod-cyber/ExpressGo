import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Keyboard, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "./Screen";
import { FoodHeader } from "./FoodHeader";
import { api } from "../services/api";
import { readFoodCart, saveFoodCartSnap, type FoodCartSnap, type FoodProfile } from "../services/foodProfile";
import { getSessionToken } from "../services/sessionToken";
import { FOOD_PLACES, type FoodDish, type FoodPlace } from "../data/foodPlaces";
import { formatMoney } from "../services/money";
import { formatUzPhone } from "../services/phoneMask";
import { useSession, useT } from "../context/Session";
import type { FoodTicket, KitchenDesk } from "../types";

export function FoodScreen({ onBack, onNeedAccount }: { onBack: () => void; onNeedAccount?: () => void }) {
  const t = useT();
  const { account } = useSession();
  const customer: FoodProfile | null = account
    ? { name: account.name, phone: account.phone, token: getSessionToken() }
    : null;
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [cart, setCart] = useState<FoodCartSnap>({ restaurantId: "", items: {} });
  const [openCart, setOpenCart] = useState(false);
  const cartCount = Object.values(cart.items).reduce((sum, qty) => sum + qty, 0);
  useEffect(() => {
    let stop = false;
    void readFoodCart().then((saved) => {
      if (stop) return;
      setCart(saved);
      setProfileReady(true);
    });
    return () => {
      stop = true;
    };
  }, []);
  useEffect(() => {
    if (!profileReady) return;
    void saveFoodCartSnap(cart);
    if (!customer?.token || !cart.restaurantId) return;
    const lines = Object.entries(cart.items).map(([foodId, quantity]) => ({ foodId, quantity }));
    void api.saveFoodCart(customer.token, cart.restaurantId, lines).catch(() => undefined);
  }, [cart, customer, profileReady]);
  function changeCart(restaurantId: string, dishId: string, next: number) {
    setCart((prev) => {
      const items = prev.restaurantId === restaurantId ? { ...prev.items } : {};
      if (next <= 0) delete items[dishId];
      else items[dishId] = next;
      return { restaurantId, items };
    });
  }
  const place = FOOD_PLACES.find((item) => item.id === placeId) ?? null;
  if (place) {
    return (
      <PlaceMenu
        place={place}
        customer={customer}
        cart={place.id === cart.restaurantId ? cart.items : {}}
        openCart={openCart}
        onCartOpened={() => setOpenCart(false)}
        onCartChange={(dishId, next) => changeCart(place.id, dishId, next)}
        onCartClear={() => setCart({ restaurantId: place.id, items: {} })}
        onNeedAccount={onNeedAccount}
        onBack={() => setPlaceId(null)}
      />
    );
  }

  return (
    <Screen compact>
      <View className="px-4 pt-2">
        <FoodHeader
          title={t("city.tile_food")}
          onBack={onBack}
          cartCount={cartCount}
          onCart={() => {
            if (!cart.restaurantId || cartCount === 0) return;
            setPlaceId(cart.restaurantId);
            setOpenCart(true);
          }}
        />
        {customer ? <FoodMine token={customer.token} onExpired={() => onNeedAccount?.()} /> : null}
        {FOOD_PLACES.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setPlaceId(item.id)}
            accessibilityRole="button"
            className="mt-4 overflow-hidden rounded-[28px] bg-card active:opacity-90"
          >
            <View>
              <Image source={item.image} style={{ width: "100%", height: 180 }} resizeMode="cover" accessibilityLabel={item.name} />
              <View className="absolute inset-x-0 bottom-0 bg-black/45 px-4 py-3">
                <Text className="text-xl font-bold text-white">{item.name}</Text>
              </View>
            </View>
            <View className="px-4 py-3">
              <View className="flex-row items-start">
                <Ionicons name="location-sharp" size={16} color="#C2410C" />
                <Text className="ml-2 flex-1 text-sm font-medium leading-5 text-ink">{item.address}</Text>
              </View>
              <View className="mt-2 flex-row items-center">
                <Ionicons name="call" size={14} color="#C2410C" />
                <Text className="ml-1.5 text-sm font-bold text-[#C2410C]">{item.phone}</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

function PlaceMenu({
  place,
  onBack,
  customer,
  cart,
  openCart,
  onCartOpened,
  onCartChange,
  onCartClear,
  onNeedAccount,
}: {
  place: FoodPlace;
  onBack: () => void;
  customer: FoodProfile | null;
  cart: Record<string, number>;
  openCart: boolean;
  onCartOpened: () => void;
  onCartChange: (dishId: string, next: number) => void;
  onCartClear: () => void;
  onNeedAccount?: () => void;
}) {
  const t = useT();
  const pageScroll = useRef<ScrollView>(null);
  const dropoffFocused = useRef(false);
  const [open, setOpen] = useState(false);
  const [dropoff, setDropoff] = useState("");
  const [choice, setChoice] = useState<"pickup" | "courier" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [accepting, setAccepting] = useState(true);
  const [tracked, setTracked] = useState<FoodTicket | null>(null);
  const digits = place.phone.replace(/\D/g, "");
  const lines = place.dishes
    .map((dish) => ({ dish, qty: cart[dish.id] ?? 0 }))
    .filter((line) => line.qty > 0);
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  const total = lines.reduce((sum, line) => sum + line.qty * line.dish.price, 0);

  useEffect(() => {
    if (!openCart) return;
    setOpen(true);
    onCartOpened();
  }, [openCart, onCartOpened]);

  useEffect(() => {
    let stop = false;
    const tick = () => {
      void api.foodPlaceOpen(place.id).then((open) => {
        if (!stop) setAccepting(open);
      }).catch(() => undefined);
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [place.id]);

  useEffect(() => {
    if (!tracked) return;
    let stop = false;
    const tick = () => {
      void api.getFoodTicket(tracked.id).then((row) => {
        if (!stop && row) setTracked(row);
      }).catch(() => undefined);
    };
    const id = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [tracked?.id]);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => pageScroll.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(id);
  }, [open, choice]);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => {
      if (dropoffFocused.current) setTimeout(() => pageScroll.current?.scrollToEnd({ animated: true }), 80);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => undefined);
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  function setQty(id: string, next: number) {
    setSent(false);
    onCartChange(id, next);
  }

  async function send(handoff: "pickup" | "courier") {
    if (handoff === "courier" && dropoff.trim().length < 2) {
      setError(t("food.drop"));
      return;
    }
    if (!customer) {
      setError(t("profile.need"));
      onNeedAccount?.();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ticket = await api.placeFoodOrder({
        placeId: place.id,
        placeName: place.name,
        pickup: place.address,
        staffPhone: place.phone,
        name: customer.name,
        phone: customer.phone,
        dropoff: handoff === "pickup" ? place.address : dropoff,
        handoff,
        lines: lines.map((line) => ({ name: t(line.dish.nameKey), qty: line.qty, price: line.dish.price })),
        guestToken: customer.token,
      });
      setTracked(ticket);
      onCartClear();
      setError(null);
      setSent(true);
      setOpen(false);
      setChoice(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("fail.generic");
      if (message.includes("Telefon tasdiqlanmagan")) onNeedAccount?.();
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen compact scrollRef={pageScroll} keyboardInsets>
      <View className="px-4 pt-2">
        <FoodHeader title={place.name} onBack={onBack} cartCount={count} onCart={() => setOpen((value) => !value)} />

        <View className="overflow-hidden rounded-[28px] bg-card">
          <View>
            <Image source={place.image} style={{ width: "100%", height: 210 }} resizeMode="cover" accessibilityLabel={place.name} />
            <View className="absolute inset-x-0 bottom-0 bg-black/45 px-4 py-3">
              <Text className="text-2xl font-bold text-white">{place.name}</Text>
            </View>
          </View>
          <View className="px-4 py-3">
            <View className="flex-row items-start">
              <Ionicons name="location-sharp" size={16} color="#C2410C" />
              <Text className="ml-2 flex-1 text-sm font-medium leading-5 text-ink">{place.address}</Text>
            </View>
            <Pressable
              onPress={() => void Linking.openURL(`tel:+${digits}`)}
              accessibilityRole="button"
              className="mt-2 flex-row items-center self-start rounded-full bg-[#FFF7ED] px-3 py-1.5"
            >
              <Ionicons name="call" size={14} color="#C2410C" />
              <Text className="ml-1.5 text-sm font-bold text-[#C2410C]">{place.phone}</Text>
            </Pressable>
          </View>
        </View>

        {!accepting ? (
          <View className="mt-3 rounded-2xl bg-[#121212] px-4 py-3">
            <Text className="text-sm font-semibold text-white">{t("food.closed_customer")}</Text>
          </View>
        ) : null}
        {sent && !open ? (
          <View className="mt-3 rounded-2xl bg-[#121212] px-4 py-3">
            <Text className="text-sm font-semibold text-white">{t("food.placed")}</Text>
            {tracked ? (
              <Text className="mt-1 text-sm font-bold text-[#FDBA74]">
                {t("food.your_status")}: {t(`food.status_${tracked.status}`)}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">{t("food.menu")}</Text>
        {place.dishes.map((dish) => (
          <DishRow key={dish.id} dish={dish} qty={cart[dish.id] ?? 0} onChange={(next) => setQty(dish.id, next)} />
        ))}
        {open ? (
          <View className="mt-4 rounded-3xl bg-card px-4 py-3">
            <Text className="text-base font-bold text-ink">{t("food.cart")}</Text>
            {lines.length === 0 ? <Text className="mt-2 text-sm text-muted">{t("food.empty")}</Text> : null}
            {lines.map((line) => (
              <View key={line.dish.id} className="mt-3 flex-row items-center">
                <Image source={line.dish.image} style={{ width: 44, height: 44, borderRadius: 12 }} />
                <View className="ml-3 min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-ink" numberOfLines={1}>
                    {t(line.dish.nameKey)}
                  </Text>
                  <Text className="text-xs font-bold text-[#C2410C]">{formatMoney(line.dish.price)}</Text>
                </View>
                <Qty qty={line.qty} onChange={(next) => setQty(line.dish.id, next)} />
              </View>
            ))}
            <View className="mt-3 flex-row items-center justify-between border-t border-slate-100 pt-3">
              <Text className="text-sm text-muted">{t("food.total")}</Text>
              <Text className="text-base font-bold text-ink">{formatMoney(total)}</Text>
            </View>
            {customer ? (
              <Text className="mt-3 text-sm font-semibold text-ink">{t("profile.using", { name: customer.name, phone: formatUzPhone(customer.phone) })}</Text>
            ) : (
              <Pressable onPress={onNeedAccount} accessibilityRole="button" className="mt-3 items-center rounded-2xl bg-[#121212] py-3">
                <Text className="text-sm font-bold text-white">{t("profile.need")}</Text>
              </Pressable>
            )}
            <TextInput
              value={dropoff}
              onChangeText={setDropoff}
              onFocus={() => {
                dropoffFocused.current = true;
                setTimeout(() => pageScroll.current?.scrollToEnd({ animated: true }), 120);
              }}
              onBlur={() => {
                dropoffFocused.current = false;
              }}
              placeholder={t("food.drop")}
              placeholderTextColor="#98A2B3"
              className="mt-2 rounded-2xl border border-line bg-card px-3 py-2.5 text-base text-ink"
            />
            {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}
            {!accepting ? <Text className="mt-2 text-sm font-semibold text-[#C2410C]">{t("food.closed_customer")}</Text> : null}
            <View className="mt-3 flex-row">
              <Pressable
                onPress={() => {
                  setError(null);
                  setChoice("pickup");
                }}
                disabled={busy || count === 0 || !accepting}
                accessibilityRole="button"
                accessibilityState={{ selected: choice === "pickup" }}
                className={`flex-1 items-center rounded-2xl border px-2 py-3 ${busy || count === 0 || !accepting ? "border-transparent bg-slate-200" : choice === "pickup" ? "border-[#121212] bg-[#121212]" : "border-[#D0D5DD] bg-card"}`}
              >
                <Text
                  numberOfLines={2}
                  className={`text-center text-sm font-bold ${busy || count === 0 || !accepting ? "text-slate-500" : choice === "pickup" ? "text-white" : "text-ink"}`}
                >
                  {t("food.pickup_self")}
                </Text>
              </Pressable>
              <View className="w-2" />
              <Pressable
                onPress={() => {
                  setError(null);
                  setChoice("courier");
                }}
                disabled={busy || count === 0 || !accepting}
                accessibilityRole="button"
                accessibilityState={{ selected: choice === "courier" }}
                className={`flex-1 items-center rounded-2xl border px-2 py-3 ${busy || count === 0 || !accepting ? "border-transparent bg-slate-200" : choice === "courier" ? "border-[#FF8A00] bg-[#FF8A00]" : "border-[#D0D5DD] bg-card"}`}
              >
                <Text
                  numberOfLines={2}
                  className={`text-center text-sm font-bold ${busy || count === 0 || !accepting ? "text-slate-500" : choice === "courier" ? "text-[#171717]" : "text-ink"}`}
                >
                  {t("food.courier_go")}
                </Text>
              </Pressable>
            </View>
            {choice ? (
              <View className="mt-3 rounded-2xl bg-card px-3 py-3">
                <Text className="text-sm leading-5 text-ink">{t("food.confirm_q")}</Text>
                <Text className="mt-1 text-sm font-bold text-[#C2410C]">
                  {choice === "pickup" ? t("food.pickup_self") : t("food.courier_go")}
                </Text>
                <Pressable
                  onPress={() => void send(choice)}
                  disabled={busy || count === 0 || !accepting}
                  accessibilityRole="button"
                  className={`mt-3 items-center rounded-2xl py-3 ${busy || count === 0 || !accepting ? "bg-slate-200" : "bg-[#121212] active:opacity-90"}`}
                >
                  <Text className={`text-sm font-bold ${busy || count === 0 || !accepting ? "text-slate-500" : "text-white"}`}>
                    {busy ? "..." : t("food.confirm_send")}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
        <View className="h-4" />
      </View>
    </Screen>
  );
}

function DishRow({ dish, qty, onChange }: { dish: FoodDish; qty: number; onChange: (next: number) => void }) {
  const t = useT();
  return (
    <View className="mt-2 flex-row items-center rounded-3xl bg-card p-3">
      <Image source={dish.image} style={{ width: 84, height: 84, borderRadius: 20 }} resizeMode="cover" />
      <View className="ml-3 min-w-0 flex-1">
        <Text className="text-base font-bold text-ink">{t(dish.nameKey)}</Text>
        <Text className="mt-0.5 text-xs text-muted" numberOfLines={2}>
          {t(dish.detailKey)}
        </Text>
        <Text className="mt-1 text-sm font-bold text-[#C2410C]">{formatMoney(dish.price)}</Text>
      </View>
      {qty > 0 ? (
        <Qty qty={qty} onChange={onChange} />
      ) : (
        <Pressable
          onPress={() => onChange(1)}
          accessibilityRole="button"
          className="h-10 w-10 items-center justify-center rounded-full bg-[#121212] active:opacity-90"
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </Pressable>
      )}
    </View>
  );
}

function Qty({ qty, onChange }: { qty: number; onChange: (next: number) => void }) {
  return (
    <View className="flex-row items-center rounded-full bg-[#FFF7ED] px-1 py-1">
      <Pressable onPress={() => onChange(qty - 1)} accessibilityRole="button" className="h-8 w-8 items-center justify-center">
        <Ionicons name="remove" size={16} color="#C2410C" />
      </Pressable>
      <Text className="min-w-[18px] text-center text-sm font-bold text-ink">{qty}</Text>
      <Pressable onPress={() => onChange(qty + 1)} accessibilityRole="button" className="h-8 w-8 items-center justify-center">
        <Ionicons name="add" size={16} color="#C2410C" />
      </Pressable>
    </View>
  );
}

function FoodMine({ token, onClose, onExpired }: { token: string; onClose?: () => void; onExpired?: () => void }) {
  const t = useT();
  const [rows, setRows] = useState<FoodTicket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [drop, setDrop] = useState("");
  const [lines, setLines] = useState<{ name: string; qty: number }[]>([]);

  const expiredRef = useRef(onExpired);
  expiredRef.current = onExpired;

  const load = useCallback(async () => {
    try {
      setRows(await api.listMyFood(token));
      setError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("fail.generic");
      if (message.includes("Telefon tasdiqlanmagan")) expiredRef.current?.();
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(ticket: FoodTicket) {
    setBusy(ticket.id);
    setError(null);
    try {
      await api.updateMyFood(token, ticket.id, {
        dropoff: drop,
        handoff: ticket.handoff,
        lines,
      });
      setEditId(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api.cancelMyFood(token, id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View className="mt-3 rounded-3xl bg-card px-4 py-4">
      <View className="flex-row items-center">
        <Text className="flex-1 text-base font-bold text-ink">{t("food.mine")}</Text>
        {onClose ? (
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text className="text-sm font-semibold text-brand">{t("food.back")}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}
      {loading && rows.length === 0 ? (
        <View className="mt-4 items-center">
          <ActivityIndicator color="#C2410C" />
        </View>
      ) : rows.length === 0 ? (
        <Text className="mt-3 text-sm text-muted">{t("food.empty")}</Text>
      ) : null}
      {rows.map((ticket) => (
        <View key={ticket.id} className="mt-3 rounded-2xl bg-[#FFF7ED] px-3 py-3">
          <Text className="text-sm font-bold text-ink">{ticket.placeName}</Text>
          <Text className="mt-1 text-xs font-bold text-[#C2410C]">{t(`food.status_${ticket.status}`)}</Text>
          {(editId === ticket.id ? lines : ticket.lines).map((line) => (
            <View key={`${ticket.id}-${line.name}`} className="mt-2 flex-row items-center">
              <Text className="flex-1 text-sm text-ink">{line.name}</Text>
              {editId === ticket.id ? (
                <View className="flex-row items-center">
                  <Pressable
                    onPress={() => setLines((prev) => prev.map((item) => (item.name === line.name ? { ...item, qty: Math.max(1, item.qty - 1) } : item)))}
                    accessibilityRole="button"
                    className="h-8 w-8 items-center justify-center"
                  >
                    <Text className="text-lg font-bold text-[#C2410C]">-</Text>
                  </Pressable>
                  <Text className="text-sm font-bold text-ink">{line.qty}</Text>
                  <Pressable
                    onPress={() => setLines((prev) => prev.map((item) => (item.name === line.name ? { ...item, qty: Math.min(20, item.qty + 1) } : item)))}
                    accessibilityRole="button"
                    className="h-8 w-8 items-center justify-center"
                  >
                    <Text className="text-lg font-bold text-[#C2410C]">+</Text>
                  </Pressable>
                </View>
              ) : (
                <Text className="text-sm font-semibold text-ink">{line.qty}</Text>
              )}
            </View>
          ))}
          {editId === ticket.id && ticket.handoff === "courier" ? (
            <TextInput
              value={drop}
              onChangeText={setDrop}
              placeholder={t("food.drop")}
              placeholderTextColor="#98A2B3"
              className="mt-2 rounded-2xl bg-card px-3 py-2 text-sm text-ink"
            />
          ) : (
            <Text className="mt-2 text-sm text-muted">{ticket.handoff === "pickup" ? t("food.pickup_self") : ticket.dropoff}</Text>
          )}
          {ticket.status === "new" ? (
            <View className="mt-3 flex-row">
              {editId === ticket.id ? (
                <Pressable onPress={() => void save(ticket)} disabled={busy === ticket.id} accessibilityRole="button" className="mr-2 flex-1 items-center rounded-2xl bg-[#C2410C] py-3">
                  <Text className="text-sm font-bold text-white">{t("trip.save")}</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    setEditId(ticket.id);
                    setDrop(ticket.dropoff);
                    setLines(ticket.lines.map((line) => ({ name: line.name, qty: line.qty })));
                  }}
                  accessibilityRole="button"
                  className="mr-2 flex-1 items-center rounded-2xl bg-[#1290F9] py-3"
                >
                  <Text className="text-sm font-bold text-white">{t("trip.edit")}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => void cancel(ticket.id)} disabled={busy === ticket.id} accessibilityRole="button" className="flex-1 items-center rounded-2xl bg-[#121212] py-3">
                <Text className="text-sm font-bold text-white">{t("food.cancel")}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function KitchenPanel({ userId, onSent }: { userId: string; onSent: () => void }) {
  const t = useT();
  const [desks, setDesks] = useState<KitchenDesk[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDesks(await api.listKitchen(userId));
    } catch {
      setDesks([]);
    }
  }, [userId]);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      void load();
    }, 2000);
    return () => clearInterval(id);
  }, [load]);

  async function act(ticketId: string, work: () => Promise<unknown>, sentCourier = false) {
    setBusy(ticketId);
    setError(null);
    try {
      await work();
      await load();
      if (sentCourier) onSent();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    } finally {
      setBusy(null);
    }
  }

  if (desks.length === 0) return null;

  return (
    <View className="mt-4">
      {desks.map((desk) => {
        const fresh = desk.tickets.filter((ticket) => ticket.status !== "rejected" && ticket.status !== "sent" && ticket.status !== "cancelled");
        return (
          <View key={desk.placeId} className="mb-3 overflow-hidden rounded-3xl border border-[#FED7AA] bg-[#FFF7ED]">
            <View className="flex-row items-center px-4 pt-4">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-[#C2410C]">
                <Ionicons name="restaurant" size={18} color="#FFFFFF" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-bold text-ink" numberOfLines={1}>
                  {desk.placeName}
                </Text>
                <Text className="text-xs text-[#C2410C]">{t("food.kitchen")}</Text>
              </View>
            </View>
            {fresh.length === 0 ? (
              <Text className="px-4 py-4 text-sm text-muted">{t("food.kitchen_empty")}</Text>
            ) : (
              fresh.map((ticket) => (
                <View key={ticket.id} className="mx-3 mb-3 mt-3 rounded-2xl bg-card px-4 py-3">
                  {ticket.lines.map((line) => (
                    <Text key={`${ticket.id}-${line.name}`} className="text-sm font-semibold text-ink">
                      {line.qty} × {line.name}
                    </Text>
                  ))}
                  <Text className="mt-2 text-sm font-bold text-[#C2410C]">{formatMoney(ticket.foodTotal)}</Text>
                  <Text className="mt-2 text-sm text-ink">{ticket.customerName}</Text>
                  <Text className="text-sm text-muted">{ticket.customerPhone}</Text>
                  <Text className="mt-1 text-sm text-ink">
                    {ticket.handoff === "pickup" ? t("food.pickup_self") : ticket.dropoff}
                  </Text>
                  <Text className="mt-2 text-xs font-bold text-[#C2410C]">{t(`food.status_${ticket.status}`)}</Text>
                  {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}
                  {ticket.status === "new" ? (
                    <Pressable
                      onPress={() => void act(ticket.id, () => api.setKitchenStatus(userId, ticket.id, "accepted"))}
                      disabled={busy === ticket.id}
                      accessibilityRole="button"
                      className="mt-3 items-center rounded-full bg-[#C2410C] py-3 active:opacity-90"
                    >
                      <Text className="text-sm font-bold text-white">{t("food.accept")}</Text>
                    </Pressable>
                  ) : null}
                  {ticket.status === "accepted" ? (
                    <Pressable
                      onPress={() => void act(ticket.id, () => api.setKitchenStatus(userId, ticket.id, "preparing"))}
                      disabled={busy === ticket.id}
                      accessibilityRole="button"
                      className="mt-3 items-center rounded-full bg-[#C2410C] py-3 active:opacity-90"
                    >
                      <Text className="text-sm font-bold text-white">{t("food.preparing")}</Text>
                    </Pressable>
                  ) : null}
                  {ticket.status === "preparing" ? (
                    <Pressable
                      onPress={() => void act(ticket.id, () => api.setKitchenStatus(userId, ticket.id, "ready"))}
                      disabled={busy === ticket.id}
                      accessibilityRole="button"
                      className="mt-3 items-center rounded-full bg-[#121212] py-3 active:opacity-90"
                    >
                      <Text className="text-sm font-bold text-white">{t("food.ready")}</Text>
                    </Pressable>
                  ) : null}
                  {ticket.status === "ready" && ticket.handoff !== "pickup" ? (
                    <Pressable
                      onPress={() => void act(ticket.id, () => api.sendKitchenToCourier(userId, ticket.id), true)}
                      disabled={busy === ticket.id}
                      accessibilityRole="button"
                      className="mt-3 items-center rounded-full bg-[#C2410C] py-3 active:opacity-90"
                    >
                      <Text className="text-sm font-bold text-white">{busy === ticket.id ? "..." : t("food.to_courier")}</Text>
                    </Pressable>
                  ) : null}
                  {ticket.status === "ready" && ticket.handoff === "pickup" ? (
                    <Text className="mt-3 text-sm font-semibold text-ink">{t("food.ready_pickup")}</Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}
