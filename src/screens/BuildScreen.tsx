import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useT } from "../context/Session";
import { useArea } from "../context/Area";
import { matchesArea, placeGroups } from "../server/places";
import { PhoneCodeBox } from "../components/PhoneCodeBox";
import { api } from "../services/api";
import { readBuildProfiles, saveBuildProfile, type BuildProfile, type BuildWho } from "../services/buildProfile";
import { formatMoney } from "../services/money";
import { formatUzPhone } from "../services/phoneMask";
import type { BuilderCard, BuilderKind, BuilderPay, BuilderTerm } from "../types";

type Side = "entry" | "hire";
type Pane = "signup" | "list" | "form" | "mine";

const TRADES = ["builder", "brick", "plaster", "tile", "plumb", "electric", "weld", "paint", "roof", "universal"] as const;

function tradeLabel(t: (key: string) => string, trade: string): string {
  if (!trade) return "";
  const key = `build.t.${trade}`;
  const label = t(key);
  return label === key ? trade : label;
}

export function BuildScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [side, setSide] = useState<Side>("entry");
  const [pane, setPane] = useState<Pane>("list");
  const [profiles, setProfiles] = useState<Partial<Record<BuildWho, BuildProfile>>>({});
  const [kind, setKind] = useState<BuilderKind>("job");
  const [draft, setDraft] = useState<BuilderCard | null>(null);
  const [fromMine, setFromMine] = useState(false);
  const who: BuildWho = "employer";
  const profile = profiles[who] ?? null;
  const ownKind: BuilderKind = "job";

  useEffect(() => {
    void readBuildProfiles().then(setProfiles);
  }, []);

  function leave() {
    if (pane === "form") {
      setDraft(null);
      setPane(fromMine ? "mine" : "list");
      setFromMine(false);
      return;
    }
    if (pane === "mine" || pane === "signup") {
      setPane("list");
      if (pane === "signup") setSide("entry");
      return;
    }
    if (side !== "entry") {
      setSide("entry");
      setPane("list");
      return;
    }
    onBack();
  }

  function enter() {
    const saved = profiles.employer;
    setSide("hire");
    setPane(saved?.token ? "list" : "signup");
  }

  function openForm(nextKind: BuilderKind, nextDraft: BuilderCard | null, mine: boolean) {
    setKind(nextKind);
    setDraft(nextDraft);
    setFromMine(mine);
    setPane("form");
  }

  return (
    <Screen compact>
      <View className="px-4 pb-8 pt-2">
        <Pressable onPress={leave} accessibilityRole="button" className="mb-3 flex-row items-center self-start">
          <Ionicons name="chevron-back" size={20} color="#C2410C" />
          <Text className="ml-1 text-sm font-semibold text-[#C2410C]">{t("build.back")}</Text>
        </Pressable>

        {side === "entry" ? <BuildEntry onHire={() => enter()} /> : null}

        {side !== "entry" && pane === "signup" ? (
          <BuildSignUp
            title={t("build.hire")}
            onSave={async (next) => {
              await saveBuildProfile(who, next);
              setProfiles((prev) => ({ ...prev, [who]: next }));
              setPane("list");
            }}
          />
        ) : null}

        {side === "hire" && pane === "list" && profile ? (
          <Board
            title={t("build.hire")}
            actionLabel={t("build.post_job")}
            onPost={() => openForm(ownKind, null, false)}
            onMine={() => setPane("mine")}
          />
        ) : null}

        {pane === "form" && profile ? (
          <AdForm
            key={draft?.id ?? kind}
            kind={kind}
            draft={draft}
            ownerName={profile.name}
            ownerPhone={profile.phone}
            ownerToken={profile.token ?? ""}
            onDone={() => {
              setDraft(null);
              setPane(fromMine ? "mine" : "list");
              setFromMine(false);
            }}
          />
        ) : null}

        {pane === "mine" && profile ? (
          <MineAds kind={ownKind} phone={profile.phone} token={profile.token ?? ""} onEdit={(card) => openForm(card.kind, card, true)} />
        ) : null}
      </View>
    </Screen>
  );
}

function BuildEntry({ onHire }: { onHire: () => void }) {
  const t = useT();
  return (
    <View>
      <View className="overflow-hidden rounded-[28px] bg-[#121212]">
        <Image source={require("../../assets/build/build-site.jpg")} style={{ width: "100%", height: 280 }} resizeMode="cover" accessibilityLabel={t("build.entry_title")} />
        <View className="absolute inset-x-0 bottom-0 bg-black/55 px-5 pb-5 pt-10">
          <Text className="text-3xl font-bold text-white">{t("build.entry_title")}</Text>
          <Text className="mt-2 text-base leading-6 text-white">{t("build.entry_body")}</Text>
        </View>
      </View>
      <Pressable onPress={onHire} accessibilityRole="button" className="mt-5 flex-row items-center justify-center rounded-full bg-[#121212] py-4 active:opacity-90">
        <Ionicons name="business" size={20} color="#FFFFFF" />
        <Text className="ml-2 text-base font-bold text-white">{t("build.hire")}</Text>
      </Pressable>
      <PublicAds />
    </View>
  );
}

function PublicAds() {
  const t = useT();
  const area = useArea();
  const [rows, setRows] = useState<BuilderCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setRows(await api.listBuilders(null));
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

  const shown = rows.filter((card) => matchesArea(area.place, card.region, card.area));

  return (
    <View className="mt-5">
      {!area.place ? (
        <Pressable onPress={area.openPicker} accessibilityRole="button" className="rounded-2xl bg-white px-4 py-3">
          <Text className="text-sm font-semibold text-ink">{t("area.pick")}</Text>
          <Text className="mt-1 text-sm text-muted">{t("area.need")}</Text>
        </Pressable>
      ) : null}
      {error ? <Text className="mt-3 text-sm text-red-600">{error}</Text> : null}
      {loading && shown.length === 0 ? (
        <View className="mt-6 items-center">
          <ActivityIndicator color="#C2410C" />
        </View>
      ) : shown.length === 0 ? (
        <View className="mt-3 rounded-3xl bg-white px-5 py-6">
          <Text className="text-base font-semibold text-ink">{t("city.all_empty")}</Text>
        </View>
      ) : (
        shown.map((card) => <AdCard key={card.id} card={card} />)
      )}
    </View>
  );
}

function BuildSignUp({
  title,
  onSave,
}: {
  title: string;
  onSave: (profile: BuildProfile) => Promise<void>;
}) {
  const t = useT();
  return (
    <PhoneCodeBox
      kind="employer"
      title={title}
      hint={t("build.sms_hint")}
      tone="orange"
      onVerified={async (pass) => {
        await onSave({ name: pass.name, phone: formatUzPhone(pass.phone), token: pass.token });
      }}
    />
  );
}

function Board({
  title,
  actionLabel,
  onPost,
  onMine,
}: {
  title: string;
  actionLabel: string;
  onPost: () => void;
  onMine: () => void;
}) {
  const t = useT();
  return (
    <View>
      <Text className="text-2xl font-bold text-ink">{title}</Text>
      <Pressable onPress={onPost} accessibilityRole="button" className="mt-4 flex-row items-center justify-center rounded-full bg-[#C2410C] py-4 active:opacity-90">
        <Ionicons name="add" size={18} color="#FFFFFF" />
        <Text className="ml-2 text-base font-bold text-white">{actionLabel}</Text>
      </Pressable>
      <Pressable onPress={onMine} accessibilityRole="button" className="mt-3 items-center rounded-full bg-[#121212] py-4 active:opacity-90">
        <Text className="text-base font-bold text-white">{t("build.mine")}</Text>
      </Pressable>
    </View>
  );
}

function AdCard({ card }: { card: BuilderCard }) {
  const t = useT();
  const digits = card.phone.replace(/\D/g, "");
  const place = [card.region, card.area].filter(Boolean).join(", ");
  const street = card.contactOpen && card.address && card.address !== place ? card.address : "";
  const pay = card.payKind === "deal" ? t("build.pay_deal") : card.price != null ? formatMoney(card.price) : "";
  const term = card.term ? t(`build.term_${card.term}`) : "";
  const meta = [term, card.workers > 0 ? t("build.workers_n", { n: card.workers }) : "", card.experience].filter(Boolean).join(" · ");
  return (
    <View className="mt-3 rounded-3xl bg-[#F3F6E8] px-4 py-2.5">
      <Text className="text-xs font-semibold uppercase text-[#C2410C]">{card.kind === "job" ? t("build.jobs_title") : t("build.offers_title")}</Text>
      <Text className="mt-1 text-base font-bold text-ink">{tradeLabel(t, card.trade) || card.name}</Text>
      {card.name ? <Text className="mt-1 text-sm text-muted">{card.name}</Text> : null}
      <Text className="mt-2 text-sm leading-5 text-ink">{card.text}</Text>
      {place ? <Text className="mt-2 text-sm text-muted">{place}</Text> : null}
      {card.kind === "offer" && street ? <Text className="mt-1 text-sm text-ink">{street}</Text> : null}
      {card.kind === "job" && !card.contactOpen ? <Text className="mt-1 text-sm text-muted">{t("build.locked_address")}</Text> : null}
      {card.kind === "job" && card.contactOpen && street ? <Text className="mt-1 text-sm text-ink">{street}</Text> : null}
      {meta ? <Text className="mt-1 text-sm font-semibold text-ink">{meta}</Text> : null}
      {card.contactOpen ? (
        <Pressable
          onPress={() => void Linking.openURL(`tel:+${digits}`)}
          accessibilityRole="button"
          className="mt-3 flex-row items-center self-start rounded-full bg-[#121212] px-4 py-2.5 active:opacity-90"
        >
          <Ionicons name="call" size={16} color="#FFFFFF" />
          <Text className="ml-2 text-sm font-bold text-white">{card.phone}</Text>
        </Pressable>
      ) : (
        <View className="mt-3 flex-row items-center self-start rounded-full bg-[#E7E5E4] px-4 py-2.5">
          <Ionicons name="lock-closed" size={16} color="#57534E" />
          <Text className="ml-2 text-sm font-bold text-ink">{card.phone}</Text>
        </View>
      )}
      {pay ? <Text className="mt-2 self-end text-[21px] font-extrabold text-[#C2410C]">{pay}</Text> : null}
    </View>
  );
}

function AdForm({
  kind,
  draft,
  ownerName,
  ownerPhone,
  ownerToken = "",
  onDone,
}: {
  kind: BuilderKind;
  draft: BuilderCard | null;
  ownerName: string;
  ownerPhone: string;
  ownerToken?: string;
  onDone: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(draft?.name || ownerName);
  const [phone] = useState(formatUzPhone(ownerPhone));
  const [trade, setTrade] = useState(TRADES.includes(draft?.trade as (typeof TRADES)[number]) ? (draft?.trade ?? "") : draft?.trade ? "other" : "");
  const [custom, setCustom] = useState(draft && !TRADES.includes(draft.trade as (typeof TRADES)[number]) ? draft.trade : "");
  const [experience, setExperience] = useState(draft?.experience ?? "");
  const [region, setRegion] = useState(draft?.region ?? "");
  const [area, setArea] = useState(draft?.area ?? "");
  const [text, setText] = useState(draft?.text ?? "");
  const [price, setPrice] = useState(draft?.price != null ? String(draft.price) : "");
  const [payKind, setPayKind] = useState<BuilderPay>(draft?.payKind || "deal");
  const [term, setTerm] = useState<BuilderTerm>(draft?.term || "day");
  const [workers, setWorkers] = useState(draft?.workers && draft.workers > 0 ? draft.workers : 1);
  const joinedPlace = [draft?.region, draft?.area].filter(Boolean).join(", ");
  const [street, setStreet] = useState(draft && draft.address && draft.address !== joinedPlace ? draft.address : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = trade === "other" ? custom.trim() : trade;

  async function submit() {
    if (chosen.length < 2) {
      setError(t("build.trade"));
      return;
    }
    if (!region || !area) {
      setError(t("build.pick_area"));
      return;
    }
    setBusy(true);
    setError(null);
    const amount = Number(price.replace(/\s/g, ""));
    const payload = {
      kind,
      name,
      phone,
      trade: chosen,
      region,
      area,
      address: kind === "job" && street.trim() ? street.trim() : `${region}, ${area}`,
      text,
      experience: kind === "offer" ? experience : "",
      price: kind === "job" ? (payKind === "fixed" ? amount : null) : price.trim() ? amount : null,
      payKind: kind === "job" ? payKind : price.trim() ? "fixed" : "",
      term: kind === "job" ? term : "",
      workers: kind === "job" ? workers : 0,
      guestToken: kind === "job" ? ownerToken : null,
    };
    try {
      if (draft) await api.updateBuilder(draft.id, ownerPhone || phone, payload);
      else await api.postBuilder(payload);
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text className="text-2xl font-bold text-ink">{kind === "offer" ? t("build.offer_btn") : t("build.post_job")}</Text>
      <Field label={t("auth.name")} value={name} onChange={setName} placeholder={t("auth.name_ph")} />
      <View className="mt-2">
        <Text className="mb-1 text-sm font-medium text-ink">{t("auth.phone")}</Text>
        <Text className="rounded-2xl border border-line bg-[#F8FAFC] px-3 py-2.5 text-base text-ink">{phone}</Text>
      </View>
      <Text className="mb-1 mt-3 text-sm font-medium text-ink">{t("build.trade")}</Text>
      <View className="flex-row flex-wrap">
        {TRADES.map((item) => (
          <Chip key={item} label={t(`build.t.${item}`)} on={trade === item} onPress={() => setTrade(item)} />
        ))}
        <Chip label={t("build.other")} on={trade === "other"} onPress={() => setTrade("other")} />
      </View>
      {trade === "other" ? <Field label={t("build.other")} value={custom} onChange={setCustom} placeholder={t("build.trade_ph")} /> : null}
      {kind === "offer" ? <Field label={t("build.experience")} value={experience} onChange={setExperience} placeholder={t("build.experience_ph")} /> : null}
      <AreaPick region={region} area={area} onChange={(nextRegion, nextArea) => { setRegion(nextRegion); setArea(nextArea); }} />
      {kind === "job" ? <Field label={t("build.street")} value={street} onChange={setStreet} placeholder={t("build.street_ph")} /> : null}
      <View className="mt-2">
        <Text className="mb-1 text-sm font-medium text-ink">{t("build.about")}</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={kind === "offer" ? t("build.about_offer") : t("build.about_job")}
          placeholderTextColor="#98A2B3"
          multiline
          className="min-h-[88px] rounded-2xl border border-line bg-white px-3 py-2.5 text-base text-ink"
        />
      </View>
      {kind === "job" ? (
        <>
          <Text className="mb-1 mt-3 text-sm font-medium text-ink">{t("build.pay")}</Text>
          <View className="flex-row">
            <Chip label={t("build.pay_deal")} on={payKind === "deal"} onPress={() => setPayKind("deal")} />
            <Chip label={t("build.pay_fixed")} on={payKind === "fixed"} onPress={() => setPayKind("fixed")} />
          </View>
          {payKind === "fixed" ? <Field label={t("build.price_optional")} value={price} onChange={setPrice} placeholder="200000" keyboard="number-pad" /> : null}
          <Text className="mb-1 mt-3 text-sm font-medium text-ink">{t("build.term")}</Text>
          <View className="flex-row flex-wrap">
            <Chip label={t("build.term_day")} on={term === "day"} onPress={() => setTerm("day")} />
            <Chip label={t("build.term_temp")} on={term === "temp"} onPress={() => setTerm("temp")} />
            <Chip label={t("build.term_steady")} on={term === "steady"} onPress={() => setTerm("steady")} />
          </View>
          <Text className="mb-1 mt-3 text-sm font-medium text-ink">{t("build.workers")}</Text>
          <View className="flex-row items-center">
            <Pressable onPress={() => setWorkers((value) => Math.max(1, value - 1))} accessibilityRole="button" className="h-10 w-10 items-center justify-center rounded-xl bg-white">
              <Text className="text-lg font-bold text-ink">-</Text>
            </Pressable>
            <Text className="mx-4 text-base font-bold text-ink">{workers}</Text>
            <Pressable onPress={() => setWorkers((value) => Math.min(50, value + 1))} accessibilityRole="button" className="h-10 w-10 items-center justify-center rounded-xl bg-white">
              <Text className="text-lg font-bold text-ink">+</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Field label={t("build.price_optional")} value={price} onChange={setPrice} placeholder="150000" keyboard="number-pad" />
      )}
      {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}
      <Pressable onPress={() => void submit()} disabled={busy} accessibilityRole="button" className={`mt-4 items-center rounded-full py-4 ${busy ? "bg-slate-200" : "bg-[#C2410C] active:opacity-90"}`}>
        <Text className={`text-base font-bold ${busy ? "text-slate-500" : "text-white"}`}>{draft ? t("trip.save") : t("build.send")}</Text>
      </Pressable>
    </View>
  );
}

function MineAds({
  kind,
  phone,
  token = "",
  onEdit,
}: {
  kind: BuilderKind;
  phone: string;
  token?: string;
  onEdit: (card: BuilderCard) => void;
}) {
  const t = useT();
  const [rows, setRows] = useState<BuilderCard[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = phone.replace(/\D/g, "").length >= 12;

  const load = useCallback(async () => {
    if (!ready) {
      setRows([]);
      return;
    }
    try {
      setRows(await api.listMyBuilders(phone, kind, kind === "job" ? token : null));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    }
  }, [kind, phone, ready, t, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(card: BuilderCard) {
    setBusy(true);
    setError(null);
    try {
      if (card.kind === "job") await api.closeBuilder(card.id, phone, token);
      else await api.deleteBuilder(card.id, phone);
      setConfirmId(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text className="text-2xl font-bold text-ink">{t("build.mine")}</Text>
      <Text className="mt-1 text-sm text-muted">{t("build.mine_hint")}</Text>
      <Text className="mt-3 text-base font-semibold text-ink">{formatUzPhone(phone)}</Text>
      {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}
      {ready && rows.length === 0 && !error ? <Text className="mt-4 text-sm text-muted">{t("build.mine_empty")}</Text> : null}
      {rows.map((card) => (
        <View key={card.id} className="mt-3 rounded-3xl bg-[#F3F6E8] px-4 py-2.5">
          <Text className="text-base font-bold text-ink">{tradeLabel(t, card.trade) || card.name}</Text>
          <Text className="mt-1 text-sm text-muted">{[card.region, card.area].filter(Boolean).join(", ")}</Text>
          {card.address ? <Text className="mt-1 text-sm text-ink">{card.address}</Text> : null}
          <Text className="mt-1 text-sm font-semibold text-ink">{card.phone}</Text>
          {card.status === "filled" ? <Text className="mt-2 text-sm font-semibold text-[#C2410C]">{t("build.closed")}</Text> : null}
          {card.status === "filled" ? null : confirmId === card.id ? (
            <View className="mt-3">
              <Text className="text-sm font-semibold text-ink">{card.kind === "job" ? t("build.found_ask") : t("build.delete_ask")}</Text>
              <View className="mt-2 flex-row">
                <Pressable onPress={() => void remove(card)} disabled={busy} accessibilityRole="button" className="mr-2 flex-1 items-center rounded-2xl bg-[#121212] py-3">
                  <Text className="text-sm font-bold text-white">{card.kind === "job" ? t("build.found") : t("build.delete_yes")}</Text>
                </Pressable>
                <Pressable onPress={() => setConfirmId(null)} disabled={busy} accessibilityRole="button" className="flex-1 items-center rounded-2xl bg-[#F8FAFC] py-3">
                  <Text className="text-sm font-bold text-ink">{t("no")}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View className="mt-3 flex-row">
              <Pressable onPress={() => onEdit(card)} accessibilityRole="button" className="mr-2 flex-1 items-center rounded-2xl bg-[#C2410C] py-3">
                <Text className="text-sm font-bold text-white">{t("build.edit")}</Text>
              </Pressable>
              <Pressable onPress={() => setConfirmId(card.id)} accessibilityRole="button" className="flex-1 items-center rounded-2xl bg-[#F8FAFC] py-3">
                <Text className="text-sm font-bold text-ink">{card.kind === "job" ? t("build.found") : t("build.delete")}</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function AreaPick({ region, area, onChange }: { region: string; area: string; onChange: (region: string, area: string) => void }) {
  const t = useT();
  const groups = placeGroups();
  const [step, setStep] = useState<"closed" | "region" | "area">("closed");
  const places = groups.find((group) => group.region === region)?.places ?? [];
  return (
    <View className="mt-2">
      <Text className="mb-1 text-sm font-medium text-ink">{t("build.region")}</Text>
      <Pressable onPress={() => setStep(step === "region" ? "closed" : "region")} accessibilityRole="button" className="rounded-2xl border border-line bg-white px-3 py-3">
        <Text className={region ? "text-base text-ink" : "text-base text-[#98A2B3]"}>{region || t("build.pick_region")}</Text>
      </Pressable>
      {step === "region" ? (
        <ScrollView className="mt-2 max-h-52 rounded-2xl bg-white" nestedScrollEnabled>
          {groups.map((group) => (
            <Pressable key={group.region} onPress={() => { onChange(group.region, ""); setStep("area"); }} accessibilityRole="button" className="px-3 py-2.5">
              <Text className="text-base text-ink">{group.region}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <Text className="mb-1 mt-2 text-sm font-medium text-ink">{t("build.area")}</Text>
      <Pressable onPress={() => { if (region) setStep(step === "area" ? "closed" : "area"); }} accessibilityRole="button" className="rounded-2xl border border-line bg-white px-3 py-3">
        <Text className={area ? "text-base text-ink" : "text-base text-[#98A2B3]"}>{area || t("build.pick_area")}</Text>
      </Pressable>
      {step === "area" ? (
        <ScrollView className="mt-2 max-h-52 rounded-2xl bg-white" nestedScrollEnabled>
          {places.map((place) => (
            <Pressable key={place.id} onPress={() => { onChange(region, place.name); setStep("closed"); }} accessibilityRole="button" className="px-3 py-2.5">
              <Text className="text-base text-ink">{place.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className={`mb-2 mr-2 rounded-full px-4 py-2 ${on ? "bg-[#C2410C]" : "bg-white"}`}>
      <Text className={`text-sm font-semibold ${on ? "text-white" : "text-ink"}`}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  keyboard?: "phone-pad" | "number-pad";
}) {
  return (
    <View className="mt-2">
      <Text className="mb-1 text-sm font-medium text-ink">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#98A2B3"
        keyboardType={keyboard}
        accessibilityLabel={label}
        className="rounded-2xl border border-line bg-white px-3 py-2.5 text-base text-ink"
      />
    </View>
  );
}
