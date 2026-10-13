import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AdBanner } from "../components/AdBanner";
import { MapBoard } from "../components/MapBoard";
import { Screen } from "../components/Screen";
import { StatusPill } from "../components/StatusPill";
import { statusLabel } from "../components/orderStatus";
import { useSession } from "../context/Session";
import { alertPing } from "../services/alert";
import { api } from "../services/api";
import { startBackgroundGps, stopBackgroundGps } from "../services/backgroundGps";
import { formatMoney } from "../services/money";
import { takeProofPhoto } from "../services/photo";
import type { MapPoint } from "../services/distance";
import { VEHICLE_LABEL, lastDropoff, matchRadiusKm } from "../server/rules";
import type { Account, CourierBoard, CourierOrder, ErrandJob, ErrandOffer } from "../types";
import { OrderDetailSheet, actionLabel, stopViews } from "../components/OrderDetailSheet";
import { CourierKassaCard } from "../components/CourierKassaCard";
import { BrandMark } from "../components/BrandMark";
import { InboxPanel } from "../components/InboxPanel";
import { ProfilePanel } from "../components/ProfilePanel";
import { AdminEntry } from "../components/DemoDock";
import { CourierTabBar, type CourierPage } from "../components/CourierTabBar";
import { HistoryStats } from "../components/HistoryStats";
import { useInbox } from "../hooks/useInbox";

function confirmRelease(
  penalty: number,
  noShow: boolean,
  work: () => void,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  Alert.alert(
    noShow ? t("courier.noshow") : t("courier.release_title"),
    noShow
      ? t("courier.release_noshow")
      : penalty > 0
        ? t("courier.release_pen", { money: formatMoney(penalty) })
        : t("courier.release_free"),
    [
      { text: t("no"), style: "cancel" },
      { text: noShow ? t("close") : t("courier.release"), style: "destructive", onPress: work },
    ],
  );
}

type ListTab = "active" | "map" | "history";
type Opened = { kind: "order" | "errand"; id: string };
type ProofDraft = { id: string; pickup?: string; dropoff?: string; signature?: string };

const pingSound = require("../../assets/ping.wav");

const emptyBoard: CourierBoard = {
  active: null,
  ping: null,
  errandPing: null,
  nearby: [],
  waiting: [],
  waitingErrands: [],
  completed: [],
  errands: [],
  activeErrand: null,
  completedErrands: [],
  pins: [],
};

function useMsLeft(until: number | null): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (until == null) {
      setLeft(0);
      return;
    }
    const end = until;
    function tick() {
      setLeft(Math.max(0, end - Date.now()));
    }
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [until]);
  return left;
}

export function CourierHomeScreen({
  lockedPage,
  showTabBar = true,
  onBack,
}: {
  lockedPage?: CourierPage;
  showTabBar?: boolean;
  onBack?: () => void;
} = {}) {
  const { account, replaceAccount, t } = useSession();
  const insets = useSafeAreaInsets();
  const userId = account?.id;
  const { inbox, markRead } = useInbox(userId);
  const [board, setBoard] = useState<CourierBoard>(emptyBoard);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ListTab>("active");
  const [page, setPage] = useState<CourierPage>(lockedPage ?? "home");
  const [notice, setNotice] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [draft, setDraft] = useState<ProofDraft | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingPlayer = useAudioPlayer(pingSound);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [nextAccount, nextBoard] = await Promise.all([
        api.getAccount(userId),
        api.getCourierBoard(userId),
      ]);
      replaceAccount(nextAccount);
      setBoard(nextBoard);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Buyurtmalar ochilmadi.");
    }
  }, [userId, replaceAccount]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const id = userId;
    let cancelled = false;
    async function beat() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted" || cancelled) return;
        const here = await Location.getCurrentPositionAsync({});
        if (cancelled) return;
        const next = await api.pingLocation(id, here.coords.latitude, here.coords.longitude);
        if (!cancelled) {
          setBoard(next);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          try {
            const next = await api.getCourierBoard(id);
            if (!cancelled) setBoard(next);
          } catch {
            // Keyingi urinishda.
          }
        }
      }
    }
    void beat();
    const gps = setInterval(() => void beat(), 20000);
    const poll = setInterval(() => {
      void api.getCourierBoard(id).then((next) => {
        if (!cancelled) setBoard(next);
      });
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(gps);
      clearInterval(poll);
    };
  }, [userId]);

  const shiftOn = account?.shiftOn === true;
  useEffect(() => {
    if (!userId || !shiftOn) {
      void stopBackgroundGps();
      return;
    }
    void startBackgroundGps(userId);
  }, [userId, shiftOn]);

  const pingShown = useRef<string | null>(null);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
    });
  }, []);

  useEffect(() => {
    const incomingOrder = board.ping;
    const incomingErrand = board.errandPing;
    const incoming = incomingOrder ?? incomingErrand;
    if (!incoming) return;
    if (pingShown.current === incoming.id) return;
    pingShown.current = incoming.id;
    setPage("orders");
    setOpened({ kind: incomingOrder ? "order" : "errand", id: incoming.id });
    setNotice(
      incoming.courierKm != null
        ? `${t("courier.offer")}: ${t("courier.from_you", { km: incoming.courierKm })}`
        : incomingOrder
          ? t("courier.ping_order")
          : t("courier.ping_errand"),
    );
    void alertPing(pingPlayer);
  }, [board.ping, board.errandPing, pingPlayer, t]);

  useEffect(() => {
    if (!opened) {
      setDraft(null);
      return;
    }
    setDraft((prev) => (prev?.id === opened.id ? prev : { id: opened.id }));
  }, [opened]);

  async function run(work: () => Promise<CourierBoard>) {
    try {
      setBoard(await work());
      if (account) {
        replaceAccount(await api.getAccount(account.id));
      }
      setError(null);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
      return false;
    }
  }

  async function saveProfile(work: () => Promise<Account>) {
    if (!account) return false;
    try {
      const next = await work();
      if (next) replaceAccount(next);
      if (userId) setBoard(await api.getCourierBoard(userId));
      setError(null);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
      return false;
    }
  }

  async function toggleShift(on: boolean) {
    if (!account) return;
    await saveProfile(() => api.setShift(account.id, on));
  }

  const needle = "";
  const nearby = useMemo(
    () =>
      board.nearby.filter((order) =>
        matches(needle, order.item, order.senderName, order.pickup, order.dropoff),
      ),
    [board.nearby, needle],
  );
  const errands = useMemo(
    () => board.errands.filter((errand) => matches(needle, errand.item, errand.district, errand.pickup)),
    [board.errands, needle],
  );
  const waiting = useMemo(
    () =>
      board.waiting.filter((order) =>
        matches(needle, order.item, order.senderName, order.pickup, order.dropoff),
      ),
    [board.waiting, needle],
  );
  const waitingErrands = useMemo(
    () => board.waitingErrands.filter((errand) => matches(needle, errand.item, errand.district, errand.pickup)),
    [board.waitingErrands, needle],
  );
  const earnings =
    board.completed
      .filter((order) => order.status === "delivered")
      .reduce((sum, order) => sum + order.courierPayout, 0) +
    board.completedErrands
      .filter((errand) => errand.status === "delivered")
      .reduce((sum, errand) => sum + (errand.collectFromCustomer - errand.productPrice), 0);
  const historyDone =
    board.completed.filter((order) => order.status === "delivered").length +
    board.completedErrands.filter((errand) => errand.status === "delivered").length;
  const historyCancel =
    board.completed.filter((order) => order.status === "cancelled").length +
    board.completedErrands.filter((errand) => errand.status === "cancelled").length;
  const historyFee = board.completed
    .filter((order) => order.commissionCharged)
    .reduce((sum, order) => sum + order.commission, 0);
  const pastOrders = board.completed.filter((order) =>
    matches(needle, order.item, order.senderName, order.pickup, order.dropoff),
  );
  const pastErrands = board.completedErrands.filter((errand) =>
    matches(needle, errand.item, errand.district, errand.pickup),
  );

  const liveOrder =
    opened?.kind === "order"
      ? [board.ping, board.active, ...board.waiting, ...board.nearby, ...board.completed].find((item) => item?.id === opened.id) ?? null
      : null;
  const liveErrand =
    opened?.kind === "errand"
      ? board.errandPing?.id === opened.id
        ? board.errandPing
        : board.activeErrand?.id === opened.id
          ? board.activeErrand
          : board.waitingErrands.find((item) => item.id === opened.id) ??
            board.errands.find((item) => item.id === opened.id) ??
            board.completedErrands.find((item) => item.id === opened.id) ??
            null
      : null;
  const errandJob: ErrandJob | null = liveErrand && isErrandJob(liveErrand) ? liveErrand : null;
  const errandOffer: ErrandOffer | null = liveErrand && !isErrandJob(liveErrand) ? liveErrand : null;
  const sheetOpen = Boolean(liveOrder || liveErrand);
  const activeJump = board.active
    ? { kind: "order" as const, id: board.active.id }
    : board.activeErrand
      ? { kind: "errand" as const, id: board.activeErrand.id }
      : null;
  const showingActive = Boolean(
    activeJump && page === "orders" && opened?.kind === activeJump.kind && opened.id === activeJump.id,
  );
  const pingUntil = liveOrder?.offeredToYou
    ? liveOrder.pingUntil
    : errandOffer?.offeredToYou
      ? errandOffer.pingUntil
      : board.ping?.pingUntil ?? board.errandPing?.pingUntil ?? null;
  const pingLeft = useMsLeft(pingUntil);
  const liveKm = liveOrder?.courierKm ?? errandOffer?.courierKm ?? errandJob?.courierKm ?? null;
  const pingHint =
    ((liveOrder?.offeredToYou || errandOffer?.offeredToYou) && pingLeft > 0)
      ? liveKm != null
        ? `${t("courier.from_you", { km: liveKm })} · ${Math.ceil(pingLeft / 1000)} s`
        : `Qabul qilish uchun ${Math.ceil(pingLeft / 1000)} s`
      : liveKm != null
        ? t("courier.from_you", { km: liveKm })
        : null;
  const orderRoute = liveOrder ? courierRoute(liveOrder, t) : null;
  const errandRoutePoint = liveErrand ? errandRoute(errandJob, errandOffer, t) : null;

  function proofUri(id: string, key: "pickup" | "dropoff" | "signature"): string | null {
    if (draft?.id !== id) return null;
    return draft[key] ?? null;
  }

  async function capture(kind: "pickup" | "dropoff") {
    if (!opened) return;
    try {
      const uri = await takeProofPhoto();
      if (!uri) return;
      setDraft((prev) => ({
        ...(prev?.id === opened.id ? prev : { id: opened.id }),
        id: opened.id,
        [kind]: uri,
      }));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rasm olinmadi.");
    }
  }

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function closeSheetSoon(kind: Opened["kind"], id: string, wait = 2000) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setOpened((current) => (current?.kind === kind && current.id === id ? null : current));
    }, wait);
  }

  function openJob(next: Opened) {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpened(next);
    setPage("orders");
  }

  async function advanceOrder() {
    if (!account || !liveOrder) return;
    if (liveOrder.status === "posted") {
      await run(() => api.acceptOrder(account.id, liveOrder.id));
      return;
    }
    if (liveOrder.status === "accepted") {
      if (liveOrder.arriveAllowed) {
        await run(() => api.markArrived(account.id, liveOrder.id));
        return;
      }
      const photo = liveOrder.pickupPhoto ?? proofUri(liveOrder.id, "pickup");
      await run(() => api.markPickedUp(account.id, liveOrder.id, photo ?? ""));
      return;
    }
    if (liveOrder.status === "picked_up") {
      if (!lastDropoff(liveOrder.dropoffs, liveOrder.stopIndex)) {
        await run(() => api.markDelivered(account.id, liveOrder.id, liveOrder.dropoffPhoto ?? ""));
        return;
      }
      const photo = liveOrder.dropoffPhoto ?? proofUri(liveOrder.id, "dropoff");
      const orderId = liveOrder.id;
      const started = Date.now();
      const ok = await run(() =>
        api.markDelivered(
          account.id,
          orderId,
          photo ?? "",
          liveOrder.signature ?? proofUri(orderId, "signature"),
        ),
      );
      if (ok) closeSheetSoon("order", orderId, Math.max(0, 2000 - (Date.now() - started)));
    }
  }

  async function advanceErrand() {
    if (!account || !liveErrand) return;
    if (errandOffer) {
      await run(() => api.acceptErrand(account.id, errandOffer.id));
      return;
    }
    if (errandJob?.status === "accepted") {
      if (errandJob.arriveAllowed) {
        await run(() => api.markArrived(account.id, errandJob.id));
        return;
      }
      const photo = errandJob.pickupPhoto ?? proofUri(errandJob.id, "pickup");
      await run(() => api.markErrandPickedUp(account.id, errandJob.id, photo ?? ""));
      return;
    }
    if (errandJob?.status === "picked_up") {
      const photo = errandJob.dropoffPhoto ?? proofUri(errandJob.id, "dropoff");
      const errandId = errandJob.id;
      const started = Date.now();
      const ok = await run(() =>
        api.markErrandDelivered(
          account.id,
          errandId,
          photo ?? "",
          errandJob.signature ?? proofUri(errandId, "signature"),
        ),
      );
      if (ok) closeSheetSoon("errand", errandId, Math.max(0, 2000 - (Date.now() - started)));
    }
  }

  function activeJobs(trackOffset: boolean) {
    const asMap = trackOffset && tab === "map";
    return (
      <View className="mt-4">
        {board.active ? (
          <MineCard
            title={t("courier.mine_order")}
            item={board.active.item}
            status={board.active.status}
            onOpen={() => openJob({ kind: "order", id: board.active!.id })}
          />
        ) : null}
        {board.activeErrand ? (
          <MineCard
            title={t("courier.mine_errand")}
            item={board.activeErrand.item}
            status={board.activeErrand.status}
            onOpen={() => openJob({ kind: "errand", id: board.activeErrand!.id })}
          />
        ) : null}
        {waiting.length > 0 || waitingErrands.length > 0 ? (
          <View className="mb-4">
            <Text className="mb-3 text-sm font-bold tracking-wide text-ink">{t("courier.new_orders")}</Text>
            {waiting.map((order) => (
              <JobOfferCard
                key={order.id}
                item={order.item}
                pickup={order.pickup}
                dropoffs={offerDropoffs(order)}
                map={asMap}
                km={order.courierKm}
                ping={false}
                fee={order.deliveryFee}
                vehicle={order.vehicle}
                onOpen={() => openJob({ kind: "order", id: order.id })}
              />
            ))}
            {waitingErrands.map((errand) => (
              <ErrandOfferCard
                key={errand.id}
                errand={errand}
                map={asMap}
                onOpen={() => openJob({ kind: "errand", id: errand.id })}
              />
            ))}
          </View>
        ) : null}
        {nearby.length === 0 && errands.length === 0 && waiting.length === 0 && waitingErrands.length === 0 && !board.active && !board.activeErrand ? (
          <View className="rounded-3xl bg-white px-5 py-8">
            <Text className="text-base font-semibold text-ink">{t("courier.empty")}</Text>
            <Text className="mt-2 text-sm text-muted">
              {!account?.docs?.ready
                ? (account?.docs?.pending ?? 0) > 0
                  ? t("courier.need_review")
                  : t("courier.need_docs")
                : !account.shiftOn
                  ? t("courier.need_shift")
                  : t("courier.need_jobs", { km: matchRadiusKm(account.vehicle) })}
            </Text>
          </View>
        ) : (
          nearby.map((order) => (
            <JobOfferCard
              key={order.id}
              item={order.item}
              pickup={order.pickup}
              dropoffs={offerDropoffs(order)}
              map={asMap}
              km={order.courierKm}
              ping={order.offeredToYou}
              fee={order.deliveryFee}
              vehicle={order.vehicle}
              onOpen={() => openJob({ kind: "order", id: order.id })}
            />
          ))
        )}
        {errands.map((errand) => (
          <ErrandOfferCard
            key={errand.id}
            errand={errand}
            map={asMap}
            onOpen={() => openJob({ kind: "errand", id: errand.id })}
          />
        ))}
      </View>
    );
  }

  return (
    <View className="flex-1">
    {onBack ? (
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={t("build.back")}
        className="absolute left-3 z-30 h-10 w-10 items-center justify-center rounded-full bg-white"
        style={{ top: insets.top + 8, elevation: 4 }}
      >
        <Ionicons name="chevron-back" size={22} color="#171717" />
      </Pressable>
    ) : null}
    <Screen
      scrollRef={scrollRef}
      scroll={page !== "home" && !(page === "orders" && sheetOpen)}
      ad={page === "home" || page === "wallet" || page === "profile" || (page === "orders" && sheetOpen) ? null : "market"}
      compact={page === "wallet" || page === "profile"}
    >
      <View className={page === "orders" && sheetOpen ? "flex-1 px-4 pt-1" : page === "home" ? "flex-1 px-4 pt-3" : "px-4 pt-3"}>
        <View className="flex-row items-center">
          <BrandMark />
          <Text className="ml-3 flex-1 text-base font-semibold text-ink" numberOfLines={1}>
            {page === "orders"
              ? t("nav.jobs")
              : page === "wallet"
                ? t("nav.wallet")
                : page === "profile"
                  ? t("nav.profile")
                  : t("sender.hello", { name: account?.name ?? t("dock.courier") })}
          </Text>
        </View>
        {notice && page !== "profile" ? <Text className="mt-2 text-xs text-muted">{notice}</Text> : null}
        {error && page !== "profile" ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}

        {page === "profile" ? (
          <>
            <ProfilePanel />
            <AdminEntry />
          </>
        ) : null}

        {page === "wallet" && account ? (
          <CourierKassaCard
            userId={account.id}
            onChanged={async () => {
              replaceAccount(await api.getAccount(account.id));
              setBoard(await api.getCourierBoard(account.id));
            }}
          />
        ) : null}

        {page === "orders" && liveOrder ? (
          <OrderDetailSheet
            item={liveOrder.item}
            who={liveOrder.senderName}
            status={liveOrder.status}
            pickup={liveOrder.pickup}
            dropoff={liveOrder.dropoff}
            stops={stopViews(liveOrder)}
            customerName={liveOrder.customerName}
            customerPhone={liveOrder.customerPhone}
            note={liveOrder.note}
            vehicle={liveOrder.vehicle}
            readyAt={liveOrder.readyAt}
            payout={liveOrder.courierPayout}
            commission={liveOrder.commission}
            acceptReason={liveOrder.acceptReason}
            hint={pingHint}
            routePoint={orderRoute?.point ?? null}
            routeSlot={orderRoute?.slot ?? null}
            pathFrom={liveOrder ? mapPoint(liveOrder.pickupLat, liveOrder.pickupLng) : null}
            dropPoint={
              liveOrder
                ? mapPoint(liveOrder.dropoffs[0]?.lat ?? liveOrder.dropoffLat, liveOrder.dropoffs[0]?.lng ?? liveOrder.dropoffLng)
                : null
            }
            dropPoints={liveOrder && liveOrder.dropoffs.length > 1 ? liveOrder.dropoffs.map((stop) => mapPoint(stop.lat, stop.lng)) : null}
            routeTitle={orderRoute?.title ?? null}
            arrivedAt={liveOrder.arrivedAt}
            waitFee={liveOrder.waitFee}
            cancelTotal={liveOrder.status === "cancelled" ? liveOrder.cancelTotal : null}
            cancelLabel={liveOrder.releaseAllowed ? liveOrder.releaseLabel : liveOrder.cancelLabel}
            primaryLabel={
              liveOrder.status === "accepted" && liveOrder.arriveAllowed
                ? t("action.arrived")
                : liveOrder.status === "picked_up" && !lastDropoff(liveOrder.dropoffs, liveOrder.stopIndex)
                  ? t("action.drop_n", { a: liveOrder.stopIndex + 1, b: liveOrder.dropoffs.length })
                  : actionLabel(liveOrder.status)
            }
            primaryDisabled={liveOrder.status === "posted" && !liveOrder.acceptAllowed}
            onPrimary={() => void advanceOrder()}
            secondaryLabel={
              liveOrder.status === "posted" && liveOrder.offeredToYou
                ? t("courier.reject")
                : liveOrder.status === "accepted" && liveOrder.noShowAllowed
                  ? t("courier.noshow")
                  : liveOrder.status === "accepted" && liveOrder.releaseAllowed
                    ? liveOrder.releasePenalty > 0
                      ? t("courier.release_m", { money: formatMoney(liveOrder.releasePenalty) })
                      : t("courier.release")
                    : null
            }
            secondaryDanger={liveOrder.status === "accepted" && liveOrder.noShowAllowed}
            onSecondary={
              liveOrder.status === "posted" && liveOrder.offeredToYou && account
                ? () =>
                    void run(() => api.declineOrder(account.id, liveOrder.id)).then((ok) => {
                      if (ok) setOpened(null);
                    })
                : liveOrder.status === "accepted" && account && liveOrder.releaseAllowed
                  ? () =>
                      confirmRelease(liveOrder.releasePenalty, liveOrder.noShowAllowed, () => {
                        void run(() => api.releaseOrder(account.id, liveOrder.id)).then((ok) => {
                          if (ok) setOpened(null);
                        });
                      }, t)
                  : undefined
            }
            proofRole="courier"
            pickupPhoto={liveOrder.pickupPhoto ?? proofUri(liveOrder.id, "pickup")}
            dropoffPhoto={liveOrder.dropoffPhoto ?? proofUri(liveOrder.id, "dropoff")}
            signature={liveOrder.signature ?? proofUri(liveOrder.id, "signature")}
            senderRating={liveOrder.senderRating}
            courierRating={liveOrder.courierRating}
            onPickupPhoto={
              liveOrder.status === "accepted" && !liveOrder.arriveAllowed ? () => void capture("pickup") : undefined
            }
            onDropoffPhoto={
              liveOrder.status === "picked_up" && lastDropoff(liveOrder.dropoffs, liveOrder.stopIndex)
                ? () => void capture("dropoff")
                : undefined
            }
            onSignature={
              liveOrder.status === "picked_up"
                ? (uri) =>
                    setDraft((prev) => ({
                      ...(prev?.id === liveOrder.id ? prev : { id: liveOrder.id }),
                      id: liveOrder.id,
                      signature: uri,
                    }))
                : undefined
            }
            onRate={
              liveOrder.status === "delivered" && account && liveOrder.courierRating == null
                ? (stars) => void run(() => api.rateAsCourier(account.id, liveOrder.id, stars))
                : undefined
            }
            onClose={() => setOpened(null)}
            chatUserId={account?.id}
            chatJobId={liveOrder.id}
            chatJobKind="order"
            stickyActions
          />
        ) : null}

        {page === "orders" && liveErrand ? (
          <OrderDetailSheet
            item={liveErrand.item}
            who={errandJob ? errandJob.district : errandOffer!.district}
            status={errandJob?.status ?? "posted"}
            pickup={liveErrand.pickup}
            dropoff={errandJob?.dropoff ?? null}
            customerName={null}
            customerPhone={errandJob?.customerPhone ?? null}
            vehicle={liveErrand.vehicle}
            readyAt={liveErrand.readyAt}
            note={
              errandOffer
                ? t("courier.buy_note", {
                    buy: formatMoney(errandOffer.productPrice),
                    take: formatMoney(errandOffer.collectFromCustomer),
                  })
                : errandJob
                  ? t("courier.take_note", { money: formatMoney(errandJob.collectFromCustomer) })
                  : null
            }
            payout={
              errandOffer
                ? errandOffer.collectFromCustomer - errandOffer.productPrice
                : errandJob
                  ? errandJob.collectFromCustomer - errandJob.productPrice
                  : null
            }
            commission={liveErrand.commission}
            acceptReason={errandOffer?.acceptReason ?? null}
            hint={pingHint}
            routePoint={errandRoutePoint?.point ?? null}
            routeSlot={errandRoutePoint?.slot ?? null}
            pathFrom={liveErrand ? mapPoint(liveErrand.pickupLat, liveErrand.pickupLng) : null}
            dropPoint={errandJob ? mapPoint(errandJob.dropoffLat, errandJob.dropoffLng) : null}
            routeTitle={errandRoutePoint?.title ?? null}
            arrivedAt={errandJob?.arrivedAt ?? null}
            waitFee={errandJob?.waitFee ?? null}
            cancelTotal={errandJob?.status === "cancelled" ? errandJob.cancelTotal : null}
            cancelLabel={errandJob?.releaseAllowed ? errandJob.releaseLabel : errandJob?.cancelLabel}
            primaryLabel={
              errandJob?.status === "accepted" && errandJob.arriveAllowed
                ? t("action.arrived")
                : actionLabel(errandJob?.status ?? "posted")
            }
            primaryDisabled={Boolean(errandOffer) && !errandOffer!.acceptAllowed}
            onPrimary={() => void advanceErrand()}
            secondaryLabel={
              errandOffer?.offeredToYou
                ? t("courier.reject")
                : errandJob?.status === "accepted" && errandJob.noShowAllowed
                  ? t("courier.noshow")
                  : errandJob?.status === "accepted" && errandJob.releaseAllowed
                    ? errandJob.releasePenalty > 0
                      ? t("courier.release_m", { money: formatMoney(errandJob.releasePenalty) })
                      : t("courier.release")
                    : null
            }
            secondaryDanger={errandJob?.status === "accepted" && errandJob.noShowAllowed}
            onSecondary={
              errandOffer?.offeredToYou && account
                ? () =>
                    void run(() => api.declineErrand(account.id, errandOffer.id)).then((ok) => {
                      if (ok) setOpened(null);
                    })
                : errandJob?.status === "accepted" && account && errandJob.releaseAllowed
                  ? () =>
                      confirmRelease(errandJob.releasePenalty, errandJob.noShowAllowed, () => {
                        void run(() => api.releaseErrand(account.id, errandJob.id)).then((ok) => {
                          if (ok) setOpened(null);
                        });
                      }, t)
                  : undefined
            }
            proofRole={errandJob ? "courier" : null}
            pickupPhoto={errandJob ? (errandJob.pickupPhoto ?? proofUri(errandJob.id, "pickup")) : null}
            dropoffPhoto={errandJob ? (errandJob.dropoffPhoto ?? proofUri(errandJob.id, "dropoff")) : null}
            signature={errandJob ? (errandJob.signature ?? proofUri(errandJob.id, "signature")) : null}
            senderRating={errandJob?.senderRating ?? null}
            courierRating={errandJob?.courierRating ?? null}
            onPickupPhoto={
              errandJob?.status === "accepted" && !errandJob.arriveAllowed ? () => void capture("pickup") : undefined
            }
            onDropoffPhoto={errandJob?.status === "picked_up" ? () => void capture("dropoff") : undefined}
            onSignature={
              errandJob?.status === "picked_up"
                ? (uri) =>
                    setDraft((prev) => ({
                      ...(prev?.id === errandJob.id ? prev : { id: errandJob.id }),
                      id: errandJob.id,
                      signature: uri,
                    }))
                : undefined
            }
            onClose={() => setOpened(null)}
            chatUserId={account?.id}
            chatJobId={liveErrand.id}
            chatJobKind="errand"
            stickyActions
          />
        ) : null}

        {page === "home" ? (
          <>
            <Pressable
              onPress={() => setMapOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t("create.map_open")}
              className="mt-4 overflow-hidden rounded-3xl"
            >
              <View pointerEvents="none">
                <MapBoard pins={board.pins} height={260} />
              </View>
            </Pressable>
            {account?.docs && account.vehicle ? (
              <View className="mt-3 flex-row items-center justify-between rounded-3xl bg-white px-4 py-3">
                <Text className="text-sm font-semibold text-ink">{t("duty.shift")}</Text>
                <Pressable
                  onPress={() => void toggleShift(!account.shiftOn)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: account.shiftOn }}
                  accessibilityLabel={t("duty.shift")}
                  className={`h-8 w-14 justify-center rounded-full px-1 ${account.shiftOn ? "bg-[#12B76A]" : "bg-slate-200"}`}
                >
                  <View className={`h-6 w-6 rounded-full bg-white ${account.shiftOn ? "self-end" : "self-start"}`} />
                </Pressable>
              </View>
            ) : null}
            <ScrollView
              ref={scrollRef}
              className="flex-1"
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={{ flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            {activeJobs(false)}

            {inbox.unread > 0 ? (
              <InboxPanel
                notes={inbox.notes}
                onReadAll={() => void markRead()}
                onOpen={(note) => {
                  void markRead(note.id);
                  if (note.jobId && note.jobKind) openJob({ kind: note.jobKind, id: note.jobId });
                }}
              />
            ) : null}
            <View className="pb-6 pt-8">
              <AdBanner id="market" />
            </View>
            </ScrollView>

            <Modal visible={mapOpen} animationType="slide" onRequestClose={() => setMapOpen(false)}>
              <View className="flex-1 bg-white" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }}>
                <View className="flex-row items-center px-4 py-3">
                  <Text className="flex-1 pr-3 text-lg font-bold text-ink">{t("tab.map")}</Text>
                  <Pressable
                    onPress={() => setMapOpen(false)}
                    accessibilityRole="button"
                    accessibilityLabel={t("close")}
                    className="p-1"
                  >
                    <Ionicons name="close" size={22} color="#667085" />
                  </Pressable>
                </View>
                <View className="flex-1">
                  {mapOpen ? <MapBoard pins={board.pins} fill /> : null}
                </View>
                <Text className="px-4 pt-3 text-xs text-muted">{t("courier.legend")}</Text>
                <Pressable
                  onPress={() => setMapOpen(false)}
                  accessibilityRole="button"
                  className="mx-4 mt-3 items-center rounded-2xl bg-[#121212] py-3.5 active:opacity-90"
                >
                  <Text className="text-base font-bold text-white">{t("create.map_done")}</Text>
                </Pressable>
              </View>
            </Modal>
          </>
        ) : null}

        {page === "orders" && !sheetOpen ? (
          <>
            <View className="mt-4 flex-row">
              <Segment label={t("tab.active")} icon="list" selected={tab === "active"} onPress={() => setTab("active")} />
              <View className="w-2" />
              <Segment label={t("tab.map")} icon="map" selected={tab === "map"} onPress={() => setTab("map")} />
              <View className="w-2" />
              <Segment label={t("tab.history")} icon="time" selected={tab === "history"} onPress={() => setTab("history")} />
            </View>
            {tab === "map" ? (
              <View className="mt-3">
                <MapBoard pins={board.pins} />
                <Text className="mt-2 text-xs text-muted">{t("courier.legend")}</Text>
              </View>
            ) : null}

        {tab === "history" ? (
          <View className="mt-3">
            <HistoryStats
              items={[
                { label: t("courier.delivered_n"), value: String(historyDone) },
                { label: t("courier.cancelled_n"), value: String(historyCancel) },
                { label: t("courier.income"), value: formatMoney(earnings) },
                { label: t("courier.fee_taken"), value: formatMoney(historyFee) },
              ]}
            />
            {pastOrders.length === 0 && pastErrands.length === 0 ? (
              <View className="rounded-3xl bg-white px-5 py-8">
                <Text className="text-base font-semibold text-ink">{t("sender.empty_hist")}</Text>
                <Text className="mt-2 text-sm text-muted">{t("courier.hist_hint")}</Text>
              </View>
            ) : null}
            {pastErrands.map((errand) => (
              <Pressable
                key={errand.id}
                onPress={() => openJob({ kind: "errand", id: errand.id })}
                accessibilityRole="button"
                className="mb-3 rounded-3xl bg-white p-4"
              >
                <Text className="text-base font-semibold text-ink">{errand.item}</Text>
                <Text className="mt-1 text-sm text-muted">{errand.district}</Text>
                <View className="mt-3">
                  <StatusPill status={errand.status} />
                </View>
                {errand.commissionCharged ? (
                  <Text className="mt-3 text-sm text-muted">{t("courier.cut", { money: formatMoney(errand.commission) })}</Text>
                ) : null}
              </Pressable>
            ))}
            {pastOrders.map((order) => (
              <Pressable
                key={order.id}
                onPress={() => openJob({ kind: "order", id: order.id })}
                accessibilityRole="button"
                className="mb-3 rounded-3xl bg-white p-4"
              >
                <Text className="text-base font-semibold text-ink">{order.item}</Text>
                <Text className="mt-1 text-sm text-muted">
                  {order.pickup} → {order.dropoff}
                </Text>
                <View className="mt-3">
                  <StatusPill status={order.status} />
                </View>
                {order.commissionCharged ? (
                  <Text className="mt-3 text-sm text-muted">{t("courier.cut", { money: formatMoney(order.commission) })}</Text>
                ) : null}
                {order.courierRating != null ? (
                  <Text className="mt-2 text-xs text-muted">{t("sender.rated", { n: order.courierRating })}</Text>
                ) : order.status === "delivered" ? (
                  <Text className="mt-2 text-xs font-semibold text-brand">{t("courier.rate_open")}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : (
          activeJobs(true)
        )}
          </>
        ) : null}
      </View>
    </Screen>
    {activeJump && !showingActive ? (
      <Pressable
        onPress={() => openJob(activeJump)}
        accessibilityRole="button"
        accessibilityLabel={t("courier.mine_order")}
        className="absolute right-4 flex-row items-center rounded-full bg-[#C2410C] px-4 py-3 active:opacity-90"
        style={{ bottom: (showTabBar ? Math.max(insets.bottom, 8) + 68 : 16), elevation: 6 }}
      >
        <Ionicons name="cube" size={18} color="#FFFFFF" />
        <Text className="ml-2 text-sm font-bold text-white" numberOfLines={1}>
          {t("courier.mine_order")}
        </Text>
      </Pressable>
    ) : null}
    {showTabBar ? <CourierTabBar page={page} unread={inbox.unread} onChange={setPage} /> : null}
    </View>
  );
}

function matches(needle: string, ...parts: string[]) {
  if (!needle) return true;
  return parts.join(" ").toLowerCase().includes(needle);
}

function mapPoint(lat: number | null | undefined, lng: number | null | undefined): MapPoint | null {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function courierRoute(
  order: CourierOrder,
  t: (key: string, vars?: Record<string, string | number>) => string,
): { point: { lat: number; lng: number }; slot: "pickup" | "drop"; title: string } | null {
  if (order.status === "delivered" || order.status === "cancelled") return null;
  if (order.status === "picked_up") {
    const stop = order.dropoffs[order.stopIndex] ?? order.dropoffs[order.dropoffs.length - 1];
    if (stop) {
      return {
        point: { lat: stop.lat, lng: stop.lng },
        slot: "drop" as const,
        title: order.dropoffs.length > 1 ? t("courier.route_stop", { n: order.stopIndex + 1 }) : t("courier.route_drop"),
      };
    }
    if (order.dropoffLat == null || order.dropoffLng == null) return null;
    return {
      point: { lat: order.dropoffLat, lng: order.dropoffLng },
      slot: "drop" as const,
      title: t("courier.route_drop"),
    };
  }
  if (order.pickupLat == null || order.pickupLng == null) return null;
  return {
    point: { lat: order.pickupLat, lng: order.pickupLng },
    slot: "pickup" as const,
    title: t("courier.route_pick"),
  };
}

function errandRoute(
  job: ErrandJob | null,
  offer: ErrandOffer | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
): { point: { lat: number; lng: number }; slot: "pickup" | "drop"; title: string } | null {
  if (job) {
    if (job.status === "delivered" || job.status === "cancelled") return null;
    if (job.status === "picked_up") {
      if (job.dropoffLat == null || job.dropoffLng == null) return null;
      return { point: { lat: job.dropoffLat, lng: job.dropoffLng }, slot: "drop" as const, title: t("courier.route_drop") };
    }
    if (job.pickupLat == null || job.pickupLng == null) return null;
    return { point: { lat: job.pickupLat, lng: job.pickupLng }, slot: "pickup" as const, title: t("courier.route_pick") };
  }
  if (offer?.pickupLat == null || offer.pickupLng == null) return null;
  return { point: { lat: offer.pickupLat, lng: offer.pickupLng }, slot: "pickup" as const, title: t("courier.route_pick") };
}

function isErrandJob(value: ErrandOffer | ErrandJob): value is ErrandJob {
  return "dropoff" in value && "customerPhone" in value && "status" in value;
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
      className={`flex-1 flex-row items-center justify-center rounded-2xl py-3 ${selected ? "bg-[#121212]" : "bg-white"}`}
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

function WaitingHead({ item, who }: { item: string; who?: string }) {
  const { t } = useSession();
  return (
    <>
      <View className="flex-row items-start justify-between">
        <Text className="flex-1 pr-3 text-lg font-bold text-ink">{item}</Text>
        <View className="flex-row items-center">
          <View className="mr-1.5 h-2 w-2 rounded-full bg-[#F5A524]" />
          <Text className="text-xs font-semibold text-[#C47E09]">{t("sheet.waiting")}</Text>
        </View>
      </View>
      {who ? <Text className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">{who.toUpperCase()}</Text> : null}
    </>
  );
}

function Pin({ text, large }: { text: string; large: boolean }) {
  return (
    <View className="mt-2 flex-row">
      <Ionicons name="location-sharp" size={16} color="#98A2B3" />
      <Text className={`ml-2 flex-1 text-ink ${large ? "text-base font-semibold" : "text-base font-semibold leading-5"}`}>{text}</Text>
    </View>
  );
}

function offerDropoffs(order: CourierOrder): string[] {
  const labels = order.dropoffs.map((stop) => stop.label.trim()).filter(Boolean);
  return labels.length > 0 ? labels : [order.dropoff];
}

function OfferRoute({ pickup, dropoffs, large }: { pickup: string; dropoffs: string[]; large: boolean }) {
  const { t } = useSession();
  const text = large ? "text-base font-semibold" : "text-base font-semibold leading-5";
  const caption = large ? "text-[11px] text-muted" : "text-[13px] leading-4 text-muted";
  const stops = dropoffs.map((label) => label.trim()).filter((label) => label.length > 0);
  return (
    <View className="mt-2">
      <View className="flex-row">
        <View className="w-4 items-center">
          <View className="mt-1.5 h-2.5 w-2.5 rounded-full bg-[#F5A524]" />
        </View>
        <View className="ml-2 flex-1">
          <Text className={caption}>{t("create.pickup")}</Text>
          <Text className={`text-ink ${text}`}>{pickup}</Text>
        </View>
      </View>
      {stops.map((label, index) => (
        <View key={`${label}-${index}`}>
          <View className={`ml-[7px] w-px bg-[#D0D5DD] ${large ? "h-5" : "h-3"}`} />
          <View className="flex-row">
            <Ionicons name="location-sharp" size={16} color="#155EEF" />
            <View className="ml-2 flex-1">
              <Text className={caption}>{`${t("create.drop")}:`}</Text>
              <Text className={`text-ink ${text}`}>{label}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function JobOfferCard({
  item,
  pickup,
  dropoffs,
  map,
  km,
  ping,
  fee,
  vehicle,
  onOpen,
}: {
  item: string;
  pickup: string;
  dropoffs: string[];
  map: boolean;
  km: number | null;
  ping: boolean;
  fee: number;
  vehicle: CourierOrder["vehicle"];
  onOpen: () => void;
}) {
  const { t } = useSession();
  const stops = dropoffs.map((label) => label.trim()).filter((label) => label.length > 0);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      className={`mb-3 rounded-3xl bg-[#E7EEF6] px-4 py-2.5 ${ping ? "border-2 border-brand" : ""}`}
    >
      <WaitingHead item={item} />
      {ping ? <Text className="mt-2 text-xs font-semibold text-[#C47E09]">{t("courier.offer")}</Text> : null}
      <OfferRoute pickup={pickup} dropoffs={stops} large={map} />
      {km != null ? <Text className="mt-2 text-sm font-semibold text-ink">{t("courier.from_you", { km })}</Text> : null}
      <Text className="mt-2 text-xs font-semibold text-ink">{VEHICLE_LABEL[vehicle]}</Text>
      <Text className="mt-2 self-end text-[21px] font-extrabold text-[#C2410C]">{formatMoney(fee)}</Text>
    </Pressable>
  );
}

function ErrandOfferCard({
  errand,
  map,
  onOpen,
}: {
  errand: ErrandOffer;
  map: boolean;
  onOpen: () => void;
}) {
  const { t } = useSession();
  const payout = errand.collectFromCustomer - errand.productPrice;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      className={`mb-3 rounded-3xl bg-[#E7EEF6] px-4 py-2.5 ${errand.offeredToYou ? "border-2 border-brand" : ""}`}
    >
      <WaitingHead item={errand.item} who={errand.district} />
      {errand.offeredToYou ? <Text className="mt-2 text-xs font-semibold text-[#C47E09]">{t("courier.offer")}</Text> : null}
      <Pin text={errand.pickup} large={map} />
      {errand.courierKm != null ? (
        <Text className="mt-2 text-sm font-semibold text-ink">{t("courier.from_you", { km: errand.courierKm })}</Text>
      ) : null}
      <Text className="mt-2 text-xs font-semibold text-ink">{VEHICLE_LABEL[errand.vehicle]}</Text>
      <Text className="mt-3 text-xs text-muted">{t("courier.pay_own")}</Text>
      <Text className="text-sm font-semibold text-ink">{formatMoney(errand.productPrice)}</Text>
      <Text className="mt-1 text-xs text-muted">{t("courier.take", { money: formatMoney(errand.collectFromCustomer) })}</Text>
      <Text className="mt-2 self-end text-[21px] font-extrabold text-[#C2410C]">{formatMoney(payout)}</Text>
    </Pressable>
  );
}

function MineCard({
  title,
  item,
  status,
  onOpen,
}: {
  title: string;
  item: string;
  status: CourierOrder["status"];
  onOpen: () => void;
}) {
  const { t } = useSession();
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" className="mt-5 rounded-3xl bg-white p-4">
      <Text className="text-sm font-semibold text-brand">{title}</Text>
      <Text className="mt-2 text-lg font-semibold text-ink">{item}</Text>
      <Text className="mt-2 text-sm text-muted">{t("courier.open_card", { status: statusLabel[status] })}</Text>
    </Pressable>
  );
}
