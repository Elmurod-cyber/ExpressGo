import { useEffect, useState } from "react";
import { Image, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatMoney } from "../services/money";
import { openRoute, openRouteLine } from "../services/maps";
import type { MapPoint } from "../services/distance";
import type { JobKind, OrderStatus, VehicleKind } from "../types";
import { ChatBox } from "./ChatBox";
import { statusLabel } from "./orderStatus";
import { SignaturePad } from "./SignaturePad";
import { VEHICLE_LABEL, formatWaitSec, readyHint, waitClock } from "../server/rules";
import { t } from "../i18n";
import { useT } from "../context/Session";

function sheetSteps() {
  return [
    { label: t("sheet.step1") },
    { label: t("sheet.step2") },
    { label: t("sheet.step3") },
    { label: t("sheet.step4") },
  ];
}

const rank: Record<OrderStatus, number> = {
  posted: 0,
  accepted: 1,
  picked_up: 2,
  delivered: 3,
  cancelled: -1,
};

export function bannerFor(
  status: OrderStatus,
  item: string,
  proofRole?: "sender" | "courier" | null,
  arrived?: boolean,
): { title: string; body: string } | null {
  if (status === "accepted" && arrived) {
    return {
      title: t("sheet.wait_title"),
      body: t("sheet.wait_body"),
    };
  }
  if (status === "accepted") {
    return {
      title: t("sheet.accepted"),
      body: t("sheet.accepted_body", { item }),
    };
  }
  if (status === "picked_up") {
    return {
      title: t("sheet.picked"),
      body: t("sheet.picked_body"),
    };
  }
  if (status === "delivered") {
    return {
      title: t("sheet.done"),
      body:
        proofRole === "sender"
          ? t("sheet.rate_c")
          : proofRole === "courier"
            ? t("sheet.rate_s")
            : t("sheet.fee_taken"),
    };
  }
  return null;
}

export function actionLabel(status: OrderStatus): string | null {
  if (status === "posted") return t("action.accept");
  if (status === "accepted") return t("action.picked");
  if (status === "picked_up") return t("action.delivered");
  return null;
}

export function stopViews(
  order: { dropoffs: { label: string }[]; stopIndex: number; status: OrderStatus },
): { label: string; state: "done" | "now" | "wait" }[] {
  return order.dropoffs.map((stop, index) => ({
    label: stop.label,
    state:
      order.status === "delivered" || index < order.stopIndex
        ? "done"
        : order.status === "picked_up" && index === order.stopIndex
          ? "now"
          : "wait",
  }));
}

type OrderDetailSheetProps = {
  item: string;
  who: string;
  status: OrderStatus;
  pickup: string;
  dropoff: string | null;
  stops?: { label: string; state: "done" | "now" | "wait" }[] | null;
  customerName: string | null;
  customerPhone: string | null;
  note?: string | null;
  payout?: number | null;
  commission?: number | null;
  acceptReason?: string | null;
  hint?: string | null;
  routePoint?: MapPoint | null;
  routeSlot?: "pickup" | "drop" | null;
  pathFrom?: MapPoint | null;
  dropPoint?: MapPoint | null;
  dropPoints?: (MapPoint | null)[] | null;
  routeTitle?: string | null;
  primaryLabel?: string | null;
  primaryDisabled?: boolean;
  onPrimary?: () => void;
  secondaryLabel?: string | null;
  secondaryDanger?: boolean;
  onSecondary?: () => void;
  onClose: () => void;
  proofRole?: "sender" | "courier" | null;
  pickupPhoto?: string | null;
  dropoffPhoto?: string | null;
  signature?: string | null;
  senderRating?: number | null;
  courierRating?: number | null;
  onPickupPhoto?: () => void;
  onDropoffPhoto?: () => void;
  onSignature?: (uri: string) => void;
  onRate?: (stars: number) => void;
  vehicle?: VehicleKind | null;
  readyAt?: number | null;
  arrivedAt?: number | null;
  waitFee?: number | null;
  cancelTotal?: number | null;
  cancelLabel?: string | null;
  chatUserId?: string | null;
  chatJobId?: string | null;
  chatJobKind?: JobKind | null;
  stickyActions?: boolean;
};

export function OrderDetailSheet({
  item,
  who,
  status,
  pickup,
  dropoff,
  stops = null,
  customerName,
  customerPhone,
  note,
  payout,
  commission,
  acceptReason,
  hint,
  routePoint,
  routeSlot = null,
  pathFrom = null,
  dropPoint = null,
  dropPoints = null,
  primaryLabel,
  primaryDisabled = false,
  onPrimary,
  secondaryLabel,
  secondaryDanger = false,
  onSecondary,
  onClose,
  proofRole = null,
  pickupPhoto = null,
  dropoffPhoto = null,
  signature = null,
  senderRating = null,
  courierRating = null,
  onPickupPhoto,
  onDropoffPhoto,
  onSignature,
  onRate,
  vehicle = null,
  readyAt = null,
  arrivedAt = null,
  waitFee = null,
  cancelTotal = null,
  cancelLabel = null,
  chatUserId = null,
  chatJobId = null,
  chatJobKind = null,
  stickyActions = false,
}: OrderDetailSheetProps) {
  const translate = useT();
  void translate;
  const waiting = status === "posted";
  const current = rank[status];
  const phone = customerPhone?.replace(/\D/g, "") ?? "";
  const banner = bannerFor(status, item, proofRole, Boolean(arrivedAt));
  const acceptFlash = status === "accepted" && arrivedAt == null;
  const arrivedFlash = status === "accepted" && arrivedAt != null;
  const flash = acceptFlash || arrivedFlash;
  const [showFlash, setShowFlash] = useState(flash);
  const [signing, setSigning] = useState(false);
  const steps = sheetSteps();
  const myRating = proofRole === "sender" ? senderRating : proofRole === "courier" ? courierRating : null;
  const theirRating = proofRole === "sender" ? courierRating : proofRole === "courier" ? senderRating : null;
  const shownBanner = flash ? (showFlash ? banner : null) : banner;

  useEffect(() => {
    if (!flash) {
      setShowFlash(false);
      return;
    }
    setShowFlash(true);
    const timer = setTimeout(() => setShowFlash(false), 3000);
    return () => clearTimeout(timer);
  }, [flash, item, arrivedAt]);

  async function call() {
    if (!phone) return;
    const number = phone.length <= 9 ? `998${phone}` : phone;
    await Linking.openURL(`tel:+${number}`);
  }

  const primaryButton =
    onPrimary && primaryLabel ? (
      <Pressable
        onPress={onPrimary}
        disabled={primaryDisabled}
        accessibilityRole="button"
        className={`${stickyActions ? "" : "mt-3 "}items-center rounded-2xl py-3.5 ${primaryDisabled ? "bg-slate-200" : "bg-brand active:opacity-90"}`}
      >
        <Text className={`text-base font-bold ${primaryDisabled ? "text-slate-500" : "text-white"}`}>{primaryLabel}</Text>
      </Pressable>
    ) : null;
  const dangerButton =
    secondaryDanger && onSecondary && secondaryLabel ? (
      <Pressable
        onPress={onSecondary}
        accessibilityRole="button"
        className="items-center rounded-[28px] bg-[#F4C7C7] px-3 py-3.5 active:opacity-90"
      >
        <Text className="text-sm font-bold text-[#912018]">{secondaryLabel}</Text>
      </Pressable>
    ) : null;
  const otherSecondary =
    !secondaryDanger && onSecondary && secondaryLabel ? (
      <Pressable onPress={onSecondary} accessibilityRole="button" className="mt-2 items-center py-2">
        <Text className="text-sm font-semibold text-muted">{secondaryLabel}</Text>
      </Pressable>
    ) : null;
  const actions =
    primaryButton || otherSecondary || (!stickyActions && dangerButton) ? (
      <>
        {primaryButton}
        {stickyActions ? otherSecondary : dangerButton ?? otherSecondary}
      </>
    ) : null;

  function dropMap(to: MapPoint | null | undefined, fallback: boolean) {
    if (pathFrom && to) return () => void openRouteLine(pathFrom, to);
    if (to) return () => void openRoute(to);
    if (fallback && routePoint) return () => void openRoute(routePoint);
    return null;
  }

  const tight = proofRole === "courier";
  const vehiclePill = vehicle ? (
    <View className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1">
      <Text className="text-xs font-semibold text-ink">{VEHICLE_LABEL[vehicle]}</Text>
    </View>
  ) : null;
  const callButton = (
    <Pressable
      onPress={() => void call()}
      disabled={!phone}
      accessibilityRole="button"
      className={`${tight ? "mt-2 py-3" : "mt-4 py-3.5"} flex-row items-center justify-center rounded-2xl ${phone ? "bg-[#FFD000] active:opacity-90" : "bg-[#FFF3B0]"}`}
    >
      <Ionicons name="call-outline" size={16} color={phone ? "#101828" : "#98A2B3"} />
      <Text className={`ml-2 text-base font-semibold ${phone ? "text-ink" : "text-muted"}`}>{t("sheet.call")}</Text>
    </Pressable>
  );
  const routeRows: { key: string; label: string; value: string; tone: "pick" | "drop"; onMap: (() => void) | null }[] = [];
  if (tight) {
    routeRows.push({
      key: "pickup",
      label: t("sheet.pickup"),
      value: pickup,
      tone: "pick",
      onMap: routePoint && routeSlot !== "drop" ? () => void openRoute(routePoint) : null,
    });
    if (stops && stops.length > 1) {
      const currentStop = stops.findIndex((stop) => stop.state === "now");
      stops.forEach((stop, index) => {
        const showMap = routePoint && routeSlot === "drop" && index === (currentStop >= 0 ? currentStop : 0);
        routeRows.push({
          key: `stop-${index}`,
          label:
            stop.state === "done"
              ? t("sheet.stop_done", { n: index + 1 })
              : stop.state === "now"
                ? t("sheet.stop_now", { n: index + 1 })
                : t("sheet.stop", { n: index + 1 }),
          value: stop.label,
          tone: "drop",
          onMap: dropMap(dropPoints?.[index] ?? null, Boolean(showMap)),
        });
      });
    } else {
      routeRows.push({
        key: "drop",
        label: t("sheet.drop"),
        value: dropoff ?? t("sheet.hidden"),
        tone: "drop",
        onMap: dropMap(dropPoint, routeSlot === "drop"),
      });
    }
  }
  const body = (
    <>
      {tight ? (
        <View className="flex-row items-start">
          <View className="min-w-0 flex-1">
            {shownBanner ? (
              <View className="rounded-2xl bg-[#12B76A] px-3 py-3">
                <View className="flex-row items-center">
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                  <Text className="ml-2 flex-1 text-base font-bold text-white">{shownBanner.title}</Text>
                </View>
                <Text className="mt-1 text-sm leading-5 text-white">{shownBanner.body}</Text>
              </View>
            ) : (
              <View className="flex-row items-center">
                <Text className="min-w-0 flex-1 text-xl font-bold text-ink" numberOfLines={2}>
                  {item}
                </Text>
                {vehiclePill ? <View className="ml-2">{vehiclePill}</View> : null}
              </View>
            )}
            {shownBanner && vehiclePill ? <View className="mt-2 self-start">{vehiclePill}</View> : null}
            {waiting && !shownBanner ? (
              <View className="mt-1 flex-row items-center self-start rounded-full bg-[#FFF6E5] px-2.5 py-1">
                <View className="mr-1.5 h-2 w-2 rounded-full bg-[#F5A524]" />
                <Text className="text-xs font-semibold text-[#C47E09]">{t("sheet.waiting")}</Text>
              </View>
            ) : null}
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("close")} className="ml-2 p-0.5">
            <Ionicons name="close" size={22} color="#667085" />
          </Pressable>
        </View>
      ) : (
        <>
      <View className="flex-row items-center justify-between">
        {waiting ? (
          <View className="flex-row items-center rounded-full bg-[#FFF6E5] px-3 py-1.5">
            <View className="mr-1.5 h-2 w-2 rounded-full bg-[#F5A524]" />
            <Text className="text-xs font-semibold text-[#C47E09]">{t("sheet.waiting")}</Text>
          </View>
        ) : (
          <View />
        )}
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("close")} className="p-1">
          <Ionicons name="close" size={22} color="#667085" />
        </Pressable>
      </View>

      {shownBanner ? (
        <View className="mt-2 rounded-2xl bg-[#12B76A] px-4 py-4">
          <View className="flex-row items-center">
            <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
            <Text className="ml-2 text-base font-bold text-white">{shownBanner.title}</Text>
          </View>
          <Text className="mt-1 text-sm leading-5 text-white">{shownBanner.body}</Text>
        </View>
      ) : (
        <>
          <Text className="mt-4 text-2xl font-bold text-ink">{item}</Text>
          <Text className="mt-1 text-sm font-medium uppercase tracking-wide text-muted">{who.toUpperCase()}</Text>
        </>
      )}
        </>
      )}

      {!waiting && !shownBanner ? (
        <Text className="mt-2 text-xs font-semibold text-brand">{statusLabel[status]}</Text>
      ) : null}

      {proofRole === "courier" ? (
        current >= 0 && steps[current] ? (
          <View className="mt-2 flex-row items-center">
            <Ionicons name="checkmark-circle" size={18} color="#12B76A" />
            <Text className="ml-2 text-sm font-semibold text-ink">{steps[current].label}</Text>
          </View>
        ) : null
      ) : (
        <View className="mt-5">
          {steps.map((step, index) => {
            const done = current >= index;
            return (
              <View key={step.label} className="flex-row">
                <View className="items-center">
                  {done ? (
                    <Ionicons name="checkmark-circle" size={22} color="#12B76A" />
                  ) : (
                    <View className="mt-1 h-3.5 w-3.5 rounded-full border-2 border-slate-300" />
                  )}
                  {index < steps.length - 1 ? (
                    <View className={`my-1 w-px flex-1 ${done && current > index ? "bg-[#12B76A]" : "bg-slate-200"}`} style={{ minHeight: 18 }} />
                  ) : null}
                </View>
                <Text className={`mb-3 ml-3 text-sm ${done ? "font-semibold text-ink" : "text-muted"}`}>{step.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      {tight ? (
        <>
          <CourierRoute rows={routeRows} phone={phone || t("sheet.hidden_name")} />
          {callButton}
        </>
      ) : (
        <>
      <AddressBox
        icon="location-sharp"
        label={t("sheet.pickup")}
        value={pickup}
        tight={tight}
        tone="pick"
        onMap={routePoint && routeSlot !== "drop" ? () => void openRoute(routePoint) : null}
      />
      {stops && stops.length > 1 ? (
        stops.map((stop, index) => {
          const currentStop = stops.findIndex((item) => item.state === "now");
          const showMap = routePoint && routeSlot === "drop" && index === (currentStop >= 0 ? currentStop : 0);
          return (
            <AddressBox
              key={`${stop.label}-${index}`}
              icon="flag"
              label={
                stop.state === "done"
                  ? t("sheet.stop_done", { n: index + 1 })
                  : stop.state === "now"
                    ? t("sheet.stop_now", { n: index + 1 })
                    : t("sheet.stop", { n: index + 1 })
              }
              value={stop.label}
              tight={tight}
              tone="drop"
              onMap={dropMap(dropPoints?.[index] ?? null, Boolean(showMap))}
            />
          );
        })
      ) : (
        <AddressBox
          icon="navigate-outline"
          label={t("sheet.drop")}
          value={dropoff ?? t("sheet.hidden")}
          tight={tight}
          tone="drop"
          onMap={dropMap(dropPoint, routeSlot === "drop")}
        />
      )}

      <View className="mt-3 flex-row">
        <InfoBox icon="person-outline" label={t("sheet.client")} value={customerName || t("sheet.hidden_name")} />
        <View className="w-3" />
        <InfoBox icon="call-outline" label={t("sheet.phone")} value={phone || t("sheet.hidden_name")} />
      </View>
      {vehicle ? (
        <View className="mt-3 rounded-2xl bg-[#F7F8FB] px-4 py-3">
          <Text className="text-xs text-muted">{t("create.vehicle")}</Text>
          <Text className="mt-1 text-base font-semibold text-ink">{VEHICLE_LABEL[vehicle]}</Text>
        </View>
      ) : null}
        </>
      )}

      {waiting && readyAt != null && readyHint(readyAt) ? (
        <View className="mt-3 rounded-2xl bg-[#FFF6E5] px-4 py-3">
          <Text className="text-xs text-[#C47E09]">{t("later")}</Text>
          <Text className="mt-1 text-base font-semibold text-ink">{readyHint(readyAt)}</Text>
        </View>
      ) : null}

      {note ? <Text className="mt-3 text-sm text-muted">{note}</Text> : null}

      <WaitBox status={status} arrivedAt={arrivedAt} storedFee={waitFee} slim={tight} />

      {proofRole === "courier" ? null : cancelTotal != null && cancelTotal > 0 ? (
        <View className="mt-3 rounded-2xl bg-[#FEF3F2] px-4 py-3">
          <Text className="text-xs text-[#B42318]">{t("sheet.cancel_fee")}</Text>
          <Text className="mt-1 text-base font-bold text-ink">{t("sheet.cash_to", { money: formatMoney(cancelTotal) })}</Text>
          {cancelLabel ? <Text className="mt-1 text-xs text-muted">{cancelLabel}</Text> : null}
        </View>
      ) : cancelLabel && status !== "cancelled" ? (
        <Text className="mt-3 text-xs text-muted">{cancelLabel}</Text>
      ) : null}

      {proofRole === "courier" || !waiting || payout == null ? null : (
        <View className="mt-4">
          <Text className="text-xs text-muted">{t("courier.keep")}</Text>
          <Text className="text-xl font-bold text-ink">{formatMoney(payout)}</Text>
          {commission != null ? (
            <Text className="mt-1 text-xs text-muted">{t("courier.fee_hint", { money: formatMoney(commission) })}</Text>
          ) : null}
        </View>
      )}

      {hint && proofRole !== "courier" ? <Text className="mt-3 text-sm font-semibold text-ink">{hint}</Text> : null}

      {status === "posted" && acceptReason ? <Text className="mt-3 text-sm text-red-600">{acceptReason}</Text> : null}

      {proofRole && status !== "posted" && status !== "cancelled" ? (
        <ProofBlock
          status={status}
          proofRole={proofRole}
          pickupPhoto={pickupPhoto}
          dropoffPhoto={dropoffPhoto}
          signature={signature}
          myRating={myRating}
          theirRating={theirRating}
          canCapturePickup={proofRole === "courier" && status === "accepted" && Boolean(onPickupPhoto)}
          canCaptureDropoff={proofRole === "courier" && status === "picked_up" && Boolean(onDropoffPhoto)}
          canSign={proofRole === "courier" && status === "picked_up" && Boolean(onSignature)}
          canRate={status === "delivered" && Boolean(onRate) && myRating == null}
          onPickupPhoto={onPickupPhoto}
          onDropoffPhoto={onDropoffPhoto}
          onSign={() => setSigning(true)}
          onRate={onRate}
        />
      ) : null}

      {tight ? null : callButton}

      {chatUserId && chatJobId && chatJobKind ? (
        <ChatBox userId={chatUserId} jobId={chatJobId} jobKind={chatJobKind} />
      ) : null}

      {stickyActions ? null : actions}
    </>
  );

  const pad = onSignature ? (
    <SignaturePad
      visible={signing}
      onCancel={() => setSigning(false)}
      onDone={(uri) => {
        onSignature(uri);
        setSigning(false);
      }}
    />
  ) : null;

  if (stickyActions) {
    return (
      <View className="min-h-0 flex-1">
        <ScrollView
          className="flex-1"
          style={{ flex: 1, minHeight: 0 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className={`rounded-[28px] bg-white ${tight ? "px-3 py-2" : "p-4"}`}>{body}</View>
        </ScrollView>
        {actions ? <View className={`rounded-[28px] bg-white px-3 ${tight ? "mt-2 py-2" : "mt-3 px-4 py-3"}`}>{actions}</View> : null}
        {dangerButton ? <View className="mt-2">{dangerButton}</View> : null}
        {pad}
      </View>
    );
  }

  return (
    <View className="mt-4 rounded-[28px] bg-white p-4">
      {body}
      {pad}
    </View>
  );
}

function WaitBox({
  status,
  arrivedAt,
  storedFee,
  slim = false,
}: {
  status: OrderStatus;
  arrivedAt: number | null;
  storedFee: number | null;
  slim?: boolean;
}) {
  const live = status === "accepted" && arrivedAt != null;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);
  const clock = waitClock({
    arrivedAt,
    freeze: !live,
    storedFee,
    at: now,
  });
  if (!clock.arrived && clock.fee <= 0) return null;
  const line =
    live && clock.freeLeftSec > 0
      ? t("sheet.free_wait", { time: formatWaitSec(clock.freeLeftSec) })
      : t("sheet.wait_fee", { money: formatMoney(clock.fee) });
  if (slim) {
    return (
      <View className="mt-2 rounded-2xl bg-[#FFF6E5] px-3 py-2">
        <View className="flex-row items-center">
          <Ionicons name="time-outline" size={16} color="#C47E09" />
          <Text className="ml-2 flex-1 text-sm font-semibold text-ink">{line}</Text>
        </View>
        {clock.maxed && !(live && clock.freeLeftSec > 0) ? (
          <Text className="mt-1 text-xs text-[#C47E09]">{t("sheet.wait_max")}</Text>
        ) : null}
      </View>
    );
  }
  return (
    <View className="mt-3 rounded-2xl bg-[#FFF6E5] px-4 py-3">
      <Text className="text-xs text-[#C47E09]">{t("sheet.wait")}</Text>
      {live && clock.freeLeftSec > 0 ? (
        <Text className="mt-1 text-base font-bold text-ink">{t("sheet.free_wait", { time: formatWaitSec(clock.freeLeftSec) })}</Text>
      ) : (
        <>
          <Text className="mt-1 text-base font-bold text-ink">{t("sheet.wait_fee", { money: formatMoney(clock.fee) })}</Text>
          {clock.maxed ? <Text className="mt-1 text-xs text-muted">{t("sheet.wait_max")}</Text> : null}
        </>
      )}
    </View>
  );
}

function ProofBlock({
  status,
  proofRole,
  pickupPhoto,
  dropoffPhoto,
  signature,
  myRating,
  theirRating,
  canCapturePickup,
  canCaptureDropoff,
  canSign,
  canRate,
  onPickupPhoto,
  onDropoffPhoto,
  onSign,
  onRate,
}: {
  status: OrderStatus;
  proofRole: "sender" | "courier";
  pickupPhoto: string | null;
  dropoffPhoto: string | null;
  signature: string | null;
  myRating: number | null;
  theirRating: number | null;
  canCapturePickup: boolean;
  canCaptureDropoff: boolean;
  canSign: boolean;
  canRate: boolean;
  onPickupPhoto?: () => void;
  onDropoffPhoto?: () => void;
  onSign: () => void;
  onRate?: (stars: number) => void;
}) {
  const [open, setOpen] = useState(proofRole !== "courier");
  return (
    <View className="mt-2 rounded-2xl bg-[#F7F8FB] px-3 py-2">
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center justify-between"
      >
        <Text className="text-sm font-semibold text-ink">{t("sheet.proof")}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color="#667085" />
      </Pressable>
      {open ? (
        <>
      <View className="mt-3 flex-row">
        <ProofThumb label={t("pickup")} uri={pickupPhoto} />
        <View className="w-2" />
        <ProofThumb label={t("dropoff")} uri={dropoffPhoto} />
        <View className="w-2" />
        <ProofThumb label={t("sheet.sign")} uri={signature} />
      </View>
      {canCapturePickup ? (
        <Pressable
          onPress={onPickupPhoto}
          accessibilityRole="button"
          className="mt-3 items-center rounded-2xl bg-[#121212] py-3 active:opacity-90"
        >
          <Text className="text-sm font-semibold text-white">
            {pickupPhoto ? t("sheet.pick_swap") : t("sheet.pick_take")}
          </Text>
        </Pressable>
      ) : null}
      {canCaptureDropoff ? (
        <Pressable
          onPress={onDropoffPhoto}
          accessibilityRole="button"
          className="mt-2 items-center rounded-2xl bg-[#121212] py-3 active:opacity-90"
        >
          <Text className="text-sm font-semibold text-white">
            {dropoffPhoto ? t("sheet.drop_swap") : t("sheet.drop_take")}
          </Text>
        </Pressable>
      ) : null}
      {canSign ? (
        <Pressable onPress={onSign} accessibilityRole="button" className="mt-2 items-center rounded-2xl border border-slate-200 bg-white py-3">
          <Text className="text-sm font-semibold text-ink">{signature ? t("sheet.sign_swap") : t("sheet.sign_opt")}</Text>
        </Pressable>
      ) : null}
      {status === "delivered" ? (
        <View className="mt-3">
          <Text className="text-xs text-muted">
            {proofRole === "sender" ? t("sheet.rate_courier") : t("sheet.rate_sender")}
          </Text>
          <Stars value={myRating} onPick={canRate ? onRate : undefined} />
          {theirRating != null ? (
            <Text className="mt-2 text-xs text-muted">
              {proofRole === "sender" ? t("sheet.their_c") : t("sheet.their_you")}: {theirRating}/5
            </Text>
          ) : null}
        </View>
      ) : null}
        </>
      ) : null}
    </View>
  );
}

function ProofThumb({ label, uri }: { label: string; uri: string | null }) {
  return (
    <View className="flex-1">
      <Text className="mb-1 text-center text-[10px] font-semibold uppercase text-muted">{label}</Text>
      {uri ? (
        <Image source={{ uri }} style={{ height: 80, width: "100%", borderRadius: 12, backgroundColor: "#E4E7EC" }} resizeMode="cover" />
      ) : (
        <View className="h-20 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white">
          <Ionicons name="camera-outline" size={18} color="#98A2B3" />
        </View>
      )}
    </View>
  );
}

function Stars({ value, onPick }: { value: number | null; onPick?: (stars: number) => void }) {
  return (
    <View className="mt-1 flex-row">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = value != null && star <= value;
        return (
          <Pressable
            key={star}
            onPress={() => onPick?.(star)}
            disabled={!onPick}
            accessibilityRole="button"
            accessibilityLabel={t("sheet.star", { n: star })}
            className="mr-1 p-1"
          >
            <Ionicons name={filled ? "star" : "star-outline"} size={26} color={filled ? "#F5C518" : "#98A2B3"} />
          </Pressable>
        );
      })}
    </View>
  );
}

function CourierRoute({
  rows,
  phone,
}: {
  rows: { key: string; label: string; value: string; tone: "pick" | "drop"; onMap: (() => void) | null }[];
  phone: string;
}) {
  return (
    <View className="mt-2 rounded-3xl border border-slate-200 bg-[#F8FAFC] px-3 py-3">
      {rows.map((row, index) => {
        const color = row.tone === "drop" ? "#027A48" : "#B54708";
        const last = index === rows.length - 1;
        return (
          <View key={row.key} className="flex-row">
            <View className="mr-2 w-4 items-center">
              <View className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              {last ? null : <View className="mt-1 w-px flex-1 bg-[#D0D5DD]" style={{ minHeight: 18 }} />}
            </View>
            <View className={`min-w-0 flex-1 flex-row items-center ${last ? "" : "pb-2"}`}>
              <View className="min-w-0 flex-1" style={{ flex: 1, minWidth: 0 }}>
                <Text className="text-[13px] font-semibold leading-4" style={{ color }}>
                  {row.label}
                </Text>
                <Text className="text-lg font-semibold leading-6 text-ink">{row.value}</Text>
              </View>
              {row.onMap ? (
                <Pressable
                  onPress={row.onMap}
                  accessibilityRole="button"
                  accessibilityLabel={t("courier.route_pick")}
                  className="ml-2 shrink-0 flex-row items-center rounded-xl bg-[#155EEF] px-2.5 py-2 active:opacity-90"
                >
                  <Ionicons name="navigate" size={14} color="#FFFFFF" />
                  <Text className="ml-1.5 text-xs font-bold text-white">{t("courier.route_pick")}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
      <View className="mt-2 flex-row items-center border-t border-slate-200 pt-2">
        <Ionicons name="call-outline" size={16} color="#667085" />
        <View className="ml-2 min-w-0 flex-1">
          <Text className="text-[13px] font-medium leading-4 text-muted">{t("sheet.phone")}</Text>
          <Text className="text-base font-semibold text-ink">{phone}</Text>
        </View>
      </View>
    </View>
  );
}

function AddressBox({
  icon,
  label,
  value,
  tight = false,
  tone = "pick",
  onMap = null,
}: {
  icon: "location-sharp" | "navigate-outline" | "flag";
  label: string;
  value: string;
  tight?: boolean;
  tone?: "pick" | "drop";
  onMap?: (() => void) | null;
}) {
  const fill = tone === "drop" ? "bg-[#D1FADF]" : "bg-[#FFE8CC]";
  const ink = tone === "drop" ? "#027A48" : "#B54708";
  return (
    <View className={`flex-row items-center ${tight ? "mt-2 px-3 py-2" : "mt-3 px-4 py-3"} rounded-2xl ${fill}`}>
      <View className="min-w-0 flex-1" style={{ flex: 1, minWidth: 0 }}>
        <View className="flex-row items-center">
          <Ionicons name={icon} size={16} color={ink} />
          <Text className="ml-1 flex-1 text-base font-semibold" style={{ color: ink }}>{label}</Text>
        </View>
        <Text className={`${tight ? "mt-0.5" : "mt-1"} text-xl font-semibold text-ink`}>{value}</Text>
      </View>
      {onMap ? (
        <Pressable
          onPress={onMap}
          accessibilityRole="button"
          accessibilityLabel={t("courier.route_pick")}
          className="ml-2 shrink-0 flex-row items-center rounded-xl bg-[#155EEF] px-2.5 py-2 active:opacity-90"
        >
          <Ionicons name="navigate" size={14} color="#FFFFFF" />
          <Text className="ml-1.5 text-xs font-bold text-white">{t("courier.route_pick")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function InfoBox({ icon, label, value, tight = false }: { icon: "person-outline" | "call-outline"; label: string; value: string; tight?: boolean }) {
  return (
    <View className={`flex-1 rounded-2xl bg-[#F7F8FB] ${tight ? "px-3 py-2" : "px-4 py-3"}`}>
      <View className="flex-row items-center">
        <Ionicons name={icon} size={14} color="#98A2B3" />
        <Text className="ml-1 text-xs text-muted">{label}</Text>
      </View>
      <Text className={`${tight ? "mt-0.5 text-sm" : "mt-1 text-base"} font-semibold text-ink`}>{value}</Text>
    </View>
  );
}
