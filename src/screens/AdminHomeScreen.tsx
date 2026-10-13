import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MapBoard } from "../components/MapBoard";
import { Screen } from "../components/Screen";
import { api } from "../services/api";
import { formatMoney } from "../services/money";
import { editUzPhone, formatUzPhone } from "../services/phoneMask";
import {
  AD_PLAN_LABEL,
  AD_PLAN_SOM,
  AD_PLANS,
  AD_SLOT_LABEL,
  AD_SLOTS,
  DOC_LABEL,
  DOC_REJECT_REASONS,
  VEHICLE_LABEL,
  formatReadyAt,
  isJobOpen,
} from "../server/rules";
import type { AdCard, AdPlan, AdSlot, AdminBoard, AdminDocReview, AdminJob, AdminPerson, OrderStatus } from "../types";
import { HeaderActions } from "../components/HeaderActions";
import { BrandMark } from "../components/BrandMark";
import { InboxPanel } from "../components/InboxPanel";
import { ProfilePanel } from "../components/ProfilePanel";
import { useInbox } from "../hooks/useInbox";
import { useSession } from "../context/Session";

type AdminTab = "jobs" | "users" | "docs" | "checks" | "ads" | "sms" | "push";
type JobView = "active" | "map";

const liveStatuses: OrderStatus[] = ["posted", "accepted", "picked_up"];

const emptyBoard: AdminBoard = {
  platformRevenue: 0,
  adRevenue: 0,
  turnover: 0,
  delivered: 0,
  active: 0,
  senders: 0,
  couriers: 0,
  jobs: [],
  people: [],
  pins: [],
  ads: [],
  cashoutTotal: 0,
  payouts: [],
  reviews: [],
  sms: [],
  pushes: [],
};

function adminStatusLabel(status: OrderStatus, t: (key: string) => string): string {
  if (status === "posted") return t("sheet.waiting");
  if (status === "accepted") return t("status.accepted");
  if (status === "picked_up") return t("status.picked_up");
  if (status === "delivered") return t("status.delivered");
  return t("status.cancelled");
}

export function AdminHomeScreen() {
  const { account, setDock, t } = useSession();
  const { inbox, markRead } = useInbox(account?.id);
  const [panel, setPanel] = useState<"inbox" | "profile" | null>(null);
  const [board, setBoard] = useState<AdminBoard>(emptyBoard);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<AdminTab>("jobs");
  const [jobView, setJobView] = useState<JobView>("active");
  const [adTitle, setAdTitle] = useState("");
  const [adPlace, setAdPlace] = useState("");
  const [adPhone, setAdPhone] = useState(formatUzPhone(""));
  const [adSlot, setAdSlot] = useState<AdSlot>("kitchen");
  const [adPlan, setAdPlan] = useState<AdPlan>("week");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setBoard(await api.getAdminBoard());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Admin ochilmadi.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function credit(courierId: string, amount: number) {
    setBusy(true);
    try {
      await api.creditCourier(courierId, amount);
      setBoard(await api.getAdminBoard());
      setNotice(t("admin.credited", { money: formatMoney(amount) }));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saved_fail"));
    } finally {
      setBusy(false);
    }
  }

  async function buyBanner() {
    setBusy(true);
    try {
      const ad = await api.buyAd({
        slot: adSlot,
        title: adTitle,
        place: adPlace,
        phone: adPhone,
        plan: adPlan,
      });
      setBoard(await api.getAdminBoard());
      setNotice(`${ad.title} chiqdi. To'lov ${formatMoney(AD_PLAN_SOM[adPlan])} platforma daromadiga yozildi (naqd/Payme keyin).`);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reklama to'lanmadi.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewDoc(item: AdminDocReview, ok: boolean, note?: string) {
    setBusy(true);
    try {
      await api.reviewCourierDoc(item.courierId, item.kind, ok, note);
      setBoard(await api.getAdminBoard());
      setNotice(ok ? `${item.who}: ${DOC_LABEL[item.kind]} tasdiqlandi.` : `${item.who}: ${DOC_LABEL[item.kind]} rad etildi.`);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Hujjat ko'rib chiqilmadi.");
    } finally {
      setBusy(false);
    }
  }

  function rejectDoc(item: AdminDocReview) {
    Alert.alert(t("admin.reject_title"), `${item.who} · ${DOC_LABEL[item.kind]}`, [
      { text: t("admin.bek"), style: "cancel" },
      ...DOC_REJECT_REASONS.map((reason) => ({
        text: reason,
        onPress: () => void reviewDoc(item, false, reason),
      })),
    ]);
  }

  useEffect(() => {
    const id = setInterval(() => {
      void api.getAdminBoard().then(setBoard);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const jobs = useMemo(() => {
    return board.jobs.filter((job) => liveStatuses.includes(job.status));
  }, [board.jobs]);

  const people = useMemo(() => board.people, [board.people]);

  const checks = useMemo(() => {
    const delivered = board.jobs.filter((job) => job.status === "delivered");
    const cancelled = board.jobs.filter((job) => job.status === "cancelled");
    const accepted = board.jobs.filter((job) => job.status === "accepted" || job.status === "picked_up");
    const chargedEarly = board.jobs.filter((job) => job.status !== "delivered" && job.commissionCharged);
    const deliveredCharged = delivered.filter((job) => job.commissionCharged).length;
    const couriersWithDeposit = board.people.filter((person) => person.role === "courier" && (person.balance ?? 0) > 0).length;
    const onShift = board.people.filter((person) => person.role === "courier" && person.shiftOn).length;
    const docsOk = board.people.filter((person) => person.role === "courier" && person.docsReady).length;
    const online = board.people.filter((person) => person.role === "courier" && person.online).length;
    const pinging = board.jobs.filter((job) => job.status === "posted" && job.pingCourierName).length;
    const missingProof = delivered.filter((job) => !job.hasPickupPhoto || !job.hasDropoffPhoto);
    const withProof = delivered.length - missingProof.length;
    const withSign = delivered.filter((job) => job.hasSignature).length;
    const senderRated = delivered.filter((job) => job.senderRating != null).length;
    const courierRated = delivered.filter((job) => job.courierRating != null).length;
    return [
      {
        ok: couriersWithDeposit === board.couriers && board.couriers > 0,
        title: t("check.dep"),
        body:
          board.couriers === 0
            ? t("check.dep0")
            : t("check.dep_n", { a: couriersWithDeposit, b: board.couriers }),
      },
      {
        ok: true,
        title: t("check.accept"),
        body: t("check.accept_n", { n: accepted.length }),
      },
      {
        ok: chargedEarly.length === 0 && (delivered.length === 0 || deliveredCharged === delivered.length),
        title: t("check.fee"),
        body:
          chargedEarly.length > 0
            ? t("check.fee_bad")
            : t("check.fee_ok", { a: deliveredCharged, b: delivered.length, c: cancelled.length }),
      },
      {
        ok: board.couriers === 0 || online > 0,
        title: t("check.near"),
        body: t("check.near_n", {
          online,
          shift: onShift,
          docs: docsOk,
          ping: pinging,
        }),
      },
      {
        ok: board.couriers === 0 || (docsOk === board.couriers && board.reviews.filter((item) => item.status === "pending").length === 0),
        title: t("check.duty"),
        body:
          board.couriers === 0
            ? t("check.duty0")
            : t("check.duty_n", {
                ok: docsOk,
                all: board.couriers,
                pend: board.reviews.filter((item) => item.status === "pending").length,
                shift: onShift,
              }),
      },
      {
        ok: missingProof.length === 0,
        title: t("check.proof"),
        body:
          delivered.length === 0
            ? t("check.proof0")
            : t("check.proof_n", {
                ok: withProof,
                all: delivered.length,
                sign: withSign,
                sr: senderRated,
                cr: courierRated,
              }),
      },
      {
        ok: true,
        title: t("kassa"),
        body:
          board.cashoutTotal <= 0
            ? t("check.cash0")
            : t("check.cash_n", { n: board.payouts.length, money: formatMoney(board.cashoutTotal) }),
      },
      {
        ok: board.ads.some((ad) => ad.live),
        title: t("admin.tab.ads"),
        body: t("check.ad_n", {
          n: board.ads.filter((ad) => ad.live).length,
          money: formatMoney(board.adRevenue),
          clicks: board.ads.reduce((sum, ad) => sum + ad.clicks, 0),
        }),
      },
    ];
  }, [board, t]);

  return (
    <Screen ad="kitchen">
      <View className="px-4 pt-3">
        <View className="flex-row items-center">
          <Pressable
            onPress={() => setDock(account?.role === "courier" ? "courier" : "sender")}
            accessibilityRole="button"
            accessibilityLabel={t("close")}
            className="mr-1 h-10 w-10 items-center justify-center"
          >
            <Ionicons name="close" size={22} color="#98A2B3" />
          </Pressable>
          <BrandMark />
          <View className="flex-1" />
          <HeaderActions unread={inbox.unread} onInbox={() => setPanel("inbox")} onProfile={() => setPanel("profile")} />
        </View>
        {notice ? <Text className="mt-2 text-xs text-muted">{notice}</Text> : null}
        {panel === "inbox" ? (
          <InboxPanel
            notes={inbox.notes}
            onReadAll={() => void markRead()}
            onClose={() => setPanel(null)}
            onOpen={(note) => void markRead(note.id)}
          />
        ) : null}
        {panel === "profile" ? <ProfilePanel onClose={() => setPanel(null)} /> : null}

        <View className="mt-4 overflow-hidden rounded-[28px] bg-[#121212] px-5 py-5">
          <View className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-brand-sky/25" />
          <Text className="text-sm font-medium text-brand-sky">{t("admin.hello")}</Text>
          <Text className="mt-4 text-3xl font-bold text-white">
            Express<Text className="text-brand-sky"> Go</Text>
          </Text>
          <Text className="mt-2 text-sm leading-5 text-white/70">
            {t("admin.sub")}
          </Text>
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            className="mt-5 items-center rounded-full bg-brand py-3.5 active:opacity-90"
          >
            <Text className="text-base font-bold text-white">
              {busy ? t("admin.refreshing") : t("admin.refresh")}
            </Text>
          </Pressable>
          <View className="mt-5 flex-row">
            <View className="flex-1">
              <Text className="text-xs text-white/50">{t("admin.revenue")}</Text>
              <Text className="mt-1 text-xl font-bold text-white">{formatMoney(board.platformRevenue)}</Text>
              <Text className="mt-1 text-[11px] text-white/50">
                {t("admin.ads_cash", { ads: formatMoney(board.adRevenue), cash: formatMoney(board.cashoutTotal) })}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs text-white/50">{t("admin.turn")}</Text>
              <Text className="mt-1 text-xl font-bold text-white">{formatMoney(board.turnover)}</Text>
            </View>
          </View>
          <Text className="mt-4 text-xs text-white/50">{t("admin.done")}</Text>
          <Text className="mt-1 text-2xl font-bold text-white">{board.delivered}</Text>
        </View>

        <View className="mt-4 flex-row">
          <Tile icon="trending-up" value={board.active} label={t("admin.active")} />
          <View className="w-3" />
          <Tile icon="checkmark-circle" value={board.delivered} label={t("admin.done")} tone="green" />
        </View>
        <View className="mt-3 flex-row">
          <Tile icon="storefront" value={board.senders} label={t("admin.senders")} />
          <View className="w-3" />
          <Tile icon="bicycle" value={board.couriers} label={t("admin.couriers")} />
        </View>

        {error ? <Text className="mt-4 text-sm text-red-600">{error}</Text> : null}

        <View className="mt-5 flex-row flex-wrap rounded-2xl bg-white p-1">
          <TextTab label={t("admin.tab.jobs")} selected={tab === "jobs"} onPress={() => setTab("jobs")} />
          <TextTab label={t("admin.tab.people")} selected={tab === "users"} onPress={() => setTab("users")} />
          <TextTab label={t("admin.tab.docs")} selected={tab === "docs"} onPress={() => setTab("docs")} />
          <TextTab label={t("admin.tab.checks")} selected={tab === "checks"} onPress={() => setTab("checks")} />
          <TextTab label={t("admin.tab.ads")} selected={tab === "ads"} onPress={() => setTab("ads")} />
          <TextTab label={t("admin.tab.sms")} selected={tab === "sms"} onPress={() => setTab("sms")} />
          <TextTab label={t("admin.tab.push")} selected={tab === "push"} onPress={() => setTab("push")} />
        </View>

        {tab === "jobs" ? (
          <>
            <View className="mt-4 flex-row">
              <Segment icon="list" label={t("admin.live_jobs")} selected={jobView === "active"} onPress={() => setJobView("active")} />
              <View className="w-2" />
              <Segment icon="map" label={t("tab.map")} selected={jobView === "map"} onPress={() => setJobView("map")} />
            </View>
            <View className="mt-4">
              {jobView === "map" ? (
                <View className="mb-3">
                  <MapBoard pins={board.pins} />
                  <Text className="mt-2 text-xs text-muted">{t("admin.legend")}</Text>
                </View>
              ) : null}
              {jobs.length === 0 ? (
                <View className="rounded-3xl bg-white px-5 py-8">
                  <Text className="text-base font-semibold text-ink">
                    {t("admin.empty_jobs")}
                  </Text>
                  <Text className="mt-2 text-sm text-muted">{t("admin.empty_jobs_hint")}</Text>
                </View>
              ) : (
                jobs.map((job) => <AdminJobCard key={job.id} job={job} map={jobView === "map"} />)
              )}
            </View>
          </>
        ) : null}

        {tab === "users" ? (
          <View className="mt-4">
            {board.payouts.length > 0 ? (
              <View className="mb-3 rounded-3xl bg-white p-4">
                <Text className="text-base font-bold text-ink">{t("admin.payouts")}</Text>
                <Text className="mt-1 text-xs text-muted">
                  {t("admin.payouts_total", { money: formatMoney(board.cashoutTotal) })}
                </Text>
                {board.payouts.slice(0, 8).map((payout) => (
                  <View key={payout.id} className="mt-3 flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-sm font-semibold text-ink">{payout.who}</Text>
                      <Text className="mt-0.5 text-xs text-muted">{formatReadyAt(payout.at)}</Text>
                    </View>
                    <Text className="text-sm font-bold text-[#C47E09]">-{formatMoney(payout.amount)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {people.length === 0 ? (
              <View className="rounded-3xl bg-white px-5 py-8">
                <Text className="text-base font-semibold text-ink">{t("admin.empty_people")}</Text>
                <Text className="mt-2 text-sm text-muted">{t("admin.empty_people_hint")}</Text>
              </View>
            ) : (
              people.map((person) => (
                <PersonRow key={person.id} person={person} busy={busy} onCredit={(amount) => void credit(person.id, amount)} />
              ))
            )}
          </View>
        ) : null}

        {tab === "docs" ? (
          <View className="mt-4">
            {board.reviews.length === 0 ? (
              <View className="rounded-3xl bg-white px-5 py-8">
                <Text className="text-base font-semibold text-ink">{t("admin.docs_empty")}</Text>
                <Text className="mt-2 text-sm text-muted">{t("admin.docs_empty_hint")}</Text>
              </View>
            ) : (
              board.reviews.map((item) => (
                <DocReviewCard
                  key={`${item.courierId}-${item.kind}`}
                  item={item}
                  busy={busy}
                  onApprove={() => void reviewDoc(item, true)}
                  onReject={() => rejectDoc(item)}
                />
              ))
            )}
          </View>
        ) : null}

        {tab === "checks" ? (
          <View className="mt-4">
            {checks.map((check) => (
              <View key={check.title} className="mb-3 rounded-3xl bg-white p-4">
                <View className="flex-row items-center">
                  <Ionicons
                    name={check.ok ? "checkmark-circle" : "alert-circle"}
                    size={22}
                    color={check.ok ? "#12B76A" : "#D92D20"}
                  />
                  <Text className="ml-2 text-base font-bold text-ink">{check.title}</Text>
                </View>
                <Text className="mt-2 text-sm leading-5 text-muted">{check.body}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {tab === "ads" ? (
          <AdsPanel
            ads={board.ads}
            title={adTitle}
            place={adPlace}
            phone={adPhone}
            slot={adSlot}
            plan={adPlan}
            busy={busy}
            onTitle={setAdTitle}
            onPlace={setAdPlace}
            onPhone={(value) => setAdPhone((prev) => editUzPhone(value, prev))}
            onSlot={setAdSlot}
            onPlan={setAdPlan}
            onBuy={() => void buyBanner()}
          />
        ) : null}

        {tab === "sms" ? (
          <View className="mt-4">
            <View className="mb-3 rounded-3xl bg-white p-4">
              <Text className="text-base font-bold text-ink">{t("admin.sms_title")}</Text>
              <Text className="mt-1 text-xs leading-4 text-muted">{t("admin.sms_hint")}</Text>
            </View>
            {board.sms.length === 0 ? (
              <View className="rounded-3xl bg-white px-5 py-8">
                <Text className="text-base font-semibold text-ink">{t("admin.sms_empty")}</Text>
                <Text className="mt-2 text-sm text-muted">{t("admin.sms_empty_hint")}</Text>
              </View>
            ) : (
              board.sms.map((item) => (
                <View key={item.id} className="mb-3 rounded-3xl bg-white p-4">
                  <View className="flex-row items-start justify-between">
                    <Text className="text-xs font-semibold text-brand">{t(`sms.${item.kind}`)}</Text>
                    <Text className="text-[11px] text-muted">{formatReadyAt(item.at)}</Text>
                  </View>
                  <Text className="mt-1 text-sm font-semibold text-ink">+{item.to}</Text>
                  <Text className="mt-2 text-sm leading-5 text-muted">{item.body}</Text>
                </View>
              ))
            )}
          </View>
        ) : null}

        {tab === "push" ? (
          <View className="mt-4">
            <View className="mb-3 rounded-3xl bg-white p-4">
              <Text className="text-base font-bold text-ink">{t("admin.push_title")}</Text>
              <Text className="mt-1 text-xs leading-4 text-muted">{t("admin.push_hint")}</Text>
            </View>
            {board.pushes.length === 0 ? (
              <View className="rounded-3xl bg-white px-5 py-8">
                <Text className="text-base font-semibold text-ink">{t("admin.push_empty")}</Text>
                <Text className="mt-2 text-sm text-muted">{t("admin.push_empty_hint")}</Text>
              </View>
            ) : (
              board.pushes.map((item) => (
                <View key={item.id} className="mb-3 rounded-3xl bg-white p-4">
                  <View className="flex-row items-start justify-between">
                    <Text className="flex-1 pr-3 text-sm font-semibold text-ink">{item.title}</Text>
                    <Text className="text-[11px] text-muted">{formatReadyAt(item.at)}</Text>
                  </View>
                  <Text className="mt-1 text-xs text-muted">{item.who}</Text>
                  <Text className="mt-2 text-sm leading-5 text-muted">{item.body}</Text>
                </View>
              ))
            )}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function AdsPanel({
  ads,
  title,
  place,
  phone,
  slot,
  plan,
  busy,
  onTitle,
  onPlace,
  onPhone,
  onSlot,
  onPlan,
  onBuy,
}: {
  ads: AdCard[];
  title: string;
  place: string;
  phone: string;
  slot: AdSlot;
  plan: AdPlan;
  busy: boolean;
  onTitle: (value: string) => void;
  onPlace: (value: string) => void;
  onPhone: (value: string) => void;
  onSlot: (value: AdSlot) => void;
  onPlan: (value: AdPlan) => void;
  onBuy: () => void;
}) {
  const { t } = useSession();
  return (
    <View className="mt-4">
      <View className="rounded-3xl bg-white p-4">
        <Text className="text-base font-bold text-ink">{t("admin.ad_buy")}</Text>
        <Text className="mt-1 text-xs leading-4 text-muted">{t("admin.ad_hint")}</Text>
        <TextInput
          value={title}
          onChangeText={onTitle}
          placeholder={t("admin.ad_name")}
          placeholderTextColor="#98A2B3"
          className="mt-3 rounded-2xl border border-slate-200 px-4 py-3 text-base text-ink"
        />
        <TextInput
          value={place}
          onChangeText={onPlace}
          placeholder={t("admin.ad_place")}
          placeholderTextColor="#98A2B3"
          className="mt-2 rounded-2xl border border-slate-200 px-4 py-3 text-base text-ink"
        />
        <TextInput
          value={phone}
          onChangeText={onPhone}
          placeholder="+998"
          placeholderTextColor="#98A2B3"
          keyboardType="phone-pad"
          className="mt-2 rounded-2xl border border-slate-200 px-4 py-3 text-base text-ink"
        />
        <Text className="mt-3 text-xs text-muted">{t("admin.ad_slot")}</Text>
        <View className="mt-2 flex-row flex-wrap">
          {AD_SLOTS.map((item) => (
            <Pressable
              key={item}
              onPress={() => onSlot(item)}
              className={`mb-1 mr-1 rounded-full px-3 py-2 ${slot === item ? "bg-[#121212]" : "bg-slate-100"}`}
            >
              <Text className={`text-xs font-semibold ${slot === item ? "text-white" : "text-ink"}`}>
                {AD_SLOT_LABEL[item]}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text className="mt-2 text-xs text-muted">{t("admin.ad_plan")}</Text>
        <View className="mt-2 flex-row flex-wrap">
          {AD_PLANS.map((item) => (
            <Pressable
              key={item}
              onPress={() => onPlan(item)}
              className={`mb-1 mr-1 rounded-full px-3 py-2 ${plan === item ? "bg-[#121212]" : "bg-slate-100"}`}
            >
              <Text className={`text-xs font-semibold ${plan === item ? "text-white" : "text-ink"}`}>
                {AD_PLAN_LABEL[item]} · {formatMoney(AD_PLAN_SOM[item])}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={onBuy}
          disabled={busy}
          accessibilityRole="button"
          className="mt-3 items-center rounded-2xl bg-[#121212] py-3.5 active:opacity-90"
        >
          <Text className="text-base font-semibold text-white">
            {busy ? t("admin.ad_writing") : t("admin.ad_pay", { money: formatMoney(AD_PLAN_SOM[plan]) })}
          </Text>
        </Pressable>
      </View>
      {ads.length === 0 ? (
        <View className="mt-3 rounded-3xl bg-white px-5 py-8">
          <Text className="text-base font-semibold text-ink">{t("admin.ad_none")}</Text>
        </View>
      ) : (
        ads.map((ad) => <AdRow key={ad.id} ad={ad} />)
      )}
    </View>
  );
}

function AdRow({ ad }: { ad: AdCard }) {
  const { t } = useSession();
  const until = new Date(ad.paidUntil);
  const when = `${until.getDate()}.${until.getMonth() + 1} ${String(until.getHours()).padStart(2, "0")}:${String(until.getMinutes()).padStart(2, "0")}`;
  return (
    <Pressable
      onPress={() =>
        Alert.alert(ad.title, `${ad.place}\n+${ad.phone.replace(/\D/g, "")}`, [
          { text: t("close"), style: "cancel" },
        ])
      }
      className="mt-3 rounded-3xl bg-white p-4"
    >
      <View className="flex-row items-start justify-between">
        <Text className="flex-1 pr-3 text-base font-bold text-ink">{ad.title}</Text>
        <Text className={`text-xs font-semibold ${ad.live ? "text-emerald-600" : "text-muted"}`}>
          {ad.live ? t("admin.ad_on") : t("admin.ad_off")}
        </Text>
      </View>
      <Text className="mt-1 text-sm text-muted">
        {AD_SLOT_LABEL[ad.slot]} · {ad.place}
      </Text>
      <Text className="mt-1 text-sm text-ink">{ad.phone}</Text>
      <Text className="mt-2 text-xs text-muted">
        {ad.live
          ? t("admin.ad_until", { money: formatMoney(ad.paidSom), n: ad.clicks, when })
          : t("admin.ad_ended", { money: formatMoney(ad.paidSom), n: ad.clicks, when })}
      </Text>
    </Pressable>
  );
}

function TextTab({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-1 items-center rounded-xl py-2.5 ${selected ? "bg-[#121212]" : ""}`}
    >
      <Text className={`text-xs font-semibold ${selected ? "text-white" : "text-muted"}`}>{label}</Text>
    </Pressable>
  );
}

function Segment({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: "list" | "map";
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
      <Ionicons name={icon === "list" ? "list" : "map-outline"} size={16} color={selected ? "#FFFFFF" : "#667085"} />
      <Text className={`ml-2 text-sm font-semibold ${selected ? "text-white" : "text-muted"}`}>{label}</Text>
    </Pressable>
  );
}

function Tile({
  icon,
  value,
  label,
  tone,
}: {
  icon: "trending-up" | "checkmark-circle" | "storefront" | "bicycle";
  value: number;
  label: string;
  tone?: "green";
}) {
  const color = tone === "green" ? "#12B76A" : "#101828";
  return (
    <View className="flex-1 rounded-3xl bg-white px-4 py-5">
      <Ionicons name={icon} size={22} color={color} />
      <Text className="mt-3 text-3xl font-bold text-ink">{value}</Text>
      <Text className="mt-1 text-sm text-muted">{label}</Text>
    </View>
  );
}

function AdminJobCard({ job, map }: { job: AdminJob; map: boolean }) {
  const { t } = useSession();
  const waiting = job.status === "posted";
  const accepted = job.status === "accepted";
  const statusColor = waiting ? "text-[#C47E09]" : accepted ? "text-[#155EEF]" : job.status === "delivered" ? "text-emerald-600" : "text-muted";
  const dot = waiting ? "bg-[#F5A524]" : accepted ? "bg-[#155EEF]" : job.status === "delivered" ? "bg-emerald-500" : "bg-slate-300";
  return (
    <View className="mb-3 rounded-3xl bg-white p-4">
      <View className="flex-row items-start justify-between">
        <Text className="flex-1 pr-3 text-lg font-bold text-ink">{job.item}</Text>
        <View className="flex-row items-center">
          <View className={`mr-1.5 h-2 w-2 rounded-full ${dot}`} />
          <Text className={`text-xs font-semibold ${statusColor}`}>
            {waiting && !isJobOpen(job.readyAt) ? formatReadyAt(job.readyAt) : adminStatusLabel(job.status, t)}
          </Text>
        </View>
      </View>
      <Text className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">{job.who.toUpperCase()}</Text>
      {waiting && !isJobOpen(job.readyAt) ? (
        <Text className="mt-1 text-xs font-semibold text-[#C47E09]">
          {t("ready.hint", { time: formatReadyAt(job.readyAt) })}
        </Text>
      ) : null}
      {job.pingCourierName ? (
        <Text className="mt-1 text-xs font-semibold text-[#155EEF]">{t("admin.offer", { name: job.pingCourierName })}</Text>
      ) : null}
      <View className="mt-3 flex-row">
        <Ionicons name="location-sharp" size={16} color="#98A2B3" />
        <Text className={`ml-2 flex-1 text-ink ${map ? "text-base font-semibold" : "text-sm"}`} numberOfLines={map ? 3 : 1}>
          {job.pickup}
        </Text>
      </View>
      <View className="mt-2 flex-row">
        <Ionicons name="navigate-outline" size={16} color="#98A2B3" />
        <Text className={`ml-2 flex-1 text-ink ${map ? "text-base font-semibold" : "text-sm"}`} numberOfLines={map ? 3 : 1}>
          {job.dropoff}
        </Text>
      </View>
      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-sm text-muted">
          {job.kind === "errand" ? t("admin.errand") : ""}
          {job.kind === "errand" && job.distanceKm != null ? " · " : ""}
          {job.distanceKm != null ? t("sender.km", { n: job.distanceKm }) : job.kind === "errand" ? "" : "—"}
          {job.dropoff.includes(" → ") ? ` · ${t("sender.stops", { n: job.dropoff.split(" → ").length })}` : ""}
          {` · ${VEHICLE_LABEL[job.vehicle]}`}
          {job.arrived ? t("admin.waiting") : ""}
          {job.waitFee > 0 ? t("admin.wait_fee", { money: formatMoney(job.waitFee) }) : ""}
          {job.cancelFee > 0 ? t("admin.cancel_fee", { money: formatMoney(job.cancelFee) }) : ""}
          {job.releasePenalty > 0 ? t("admin.pen", { money: formatMoney(job.releasePenalty) }) : ""}
        </Text>
        <View className="flex-row items-center">
          <Ionicons name="cash-outline" size={16} color="#12B76A" />
          <Text className="ml-1 text-sm font-bold text-ink">{formatMoney(job.fee)}</Text>
        </View>
      </View>
      {job.status === "delivered" || job.status === "picked_up" || job.status === "accepted" ? (
        <Text className="mt-2 text-xs text-muted">
          {t("admin.proof_line", {
            a: job.hasPickupPhoto ? t("admin.has") : t("admin.miss"),
            b: job.hasDropoffPhoto ? t("admin.has") : t("admin.miss"),
          })}
          {job.hasSignature ? t("admin.sign_yes") : ""}
          {job.senderRating != null ? t("admin.rate_s", { n: job.senderRating }) : ""}
          {job.courierRating != null ? t("admin.rate_c", { n: job.courierRating }) : ""}
        </Text>
      ) : null}
    </View>
  );
}

function DocReviewCard({
  item,
  busy,
  onApprove,
  onReject,
}: {
  item: AdminDocReview;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { t } = useSession();
  const pending = item.status === "pending";
  return (
    <View className="mb-3 rounded-3xl bg-white p-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-base font-bold text-ink">{item.who}</Text>
          <Text className="mt-1 text-xs text-muted">
            {item.phone} · {VEHICLE_LABEL[item.vehicle]}
          </Text>
          <Text className="mt-2 text-sm font-semibold text-ink">{DOC_LABEL[item.kind]}</Text>
          <Text className={`mt-1 text-xs font-semibold ${pending ? "text-[#C47E09]" : "text-red-600"}`}>
            {pending ? t("doc.pending") : `${t("doc.rejected")}${item.note ? ` · ${item.note}` : ""}`}
          </Text>
        </View>
        <Image source={{ uri: item.uri }} style={{ width: 72, height: 72, borderRadius: 16 }} />
      </View>
      <View className="mt-3 flex-row">
        <Pressable
          onPress={onApprove}
          disabled={busy}
          accessibilityRole="button"
          className="mr-2 flex-1 items-center rounded-2xl bg-[#12B76A] py-3 active:opacity-90"
        >
          <Text className="text-sm font-semibold text-white">{t("admin.approve")}</Text>
        </Pressable>
        <Pressable
          onPress={onReject}
          disabled={busy}
          accessibilityRole="button"
          className="ml-2 flex-1 items-center rounded-2xl bg-[#FEF3F2] py-3 active:opacity-90"
        >
          <Text className="text-sm font-semibold text-[#B42318]">{t("admin.reject")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PersonRow({
  person,
  busy,
  onCredit,
}: {
  person: AdminPerson;
  busy: boolean;
  onCredit: (amount: number) => void;
}) {
  const { t } = useSession();
  const [sum, setSum] = useState("");
  const courier = person.role === "courier";
  const amount = Math.round(Number(sum));
  return (
    <View className="mb-3 rounded-3xl bg-white p-4">
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 pr-3 text-base font-bold text-ink">{person.name}</Text>
        <Text className="text-xs font-semibold text-muted">
          {courier
            ? person.online
              ? t("admin.role_on")
              : person.shiftOn
                ? t("admin.role_gps")
                : t("admin.role_off")
            : t("admin.merchant")}
        </Text>
      </View>
      <Text className="mt-1 text-sm text-muted">{person.phone}</Text>
      {courier ? (
        <>
          <Text className="mt-2 text-sm font-semibold text-ink">
            {t("admin.dep", { money: formatMoney(person.balance ?? 0) })}
            {person.vehicle ? ` · ${VEHICLE_LABEL[person.vehicle]}` : ""}
          </Text>
          <Text className="mt-1 text-xs text-muted">
            {person.docsReady
              ? t("admin.docs_ok")
              : person.docsPending > 0
                ? t("admin.docs_n", { n: person.docsPending })
                : person.docsRejected > 0
                  ? t("admin.docs_rej", { n: person.docsRejected })
                  : t("admin.docs_wait")}
            {person.shiftOn ? ` · ${t("profile.shift_on")}` : ` · ${t("profile.shift_off")}`}
          </Text>
          <View className="mt-3 flex-row items-center">
            <TextInput
              value={sum}
              onChangeText={(value) => setSum(value.replace(/\D/g, "").slice(0, 9))}
              placeholder={t("admin.credit_ph")}
              placeholderTextColor="#98A2B3"
              keyboardType="number-pad"
              className="h-10 flex-1 rounded-xl border border-line bg-canvas px-3 text-sm text-ink"
            />
            <Pressable
              onPress={() => {
                if (amount > 0) {
                  onCredit(amount);
                  setSum("");
                }
              }}
              disabled={busy || amount <= 0}
              accessibilityRole="button"
              className={`ml-2 h-10 justify-center rounded-xl px-3 ${busy || amount <= 0 ? "bg-slate-200" : "bg-[#121212] active:opacity-90"}`}
            >
              <Text className={`text-xs font-semibold ${busy || amount <= 0 ? "text-slate-500" : "text-white"}`}>
                {t("admin.credit")}
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Text className="mt-2 text-xs text-muted">{t("admin.free_ads")}</Text>
      )}
    </View>
  );
}
