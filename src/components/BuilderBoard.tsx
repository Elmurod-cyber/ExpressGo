import { useCallback, useEffect, useState } from "react";
import { Image, Linking, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../services/api";
import { editUzPhone, formatUzPhone } from "../services/phoneMask";
import { takeProofPhoto } from "../services/photo";
import type { BuilderCard, BuilderKind } from "../types";
import { useT } from "../context/Session";

export function BuilderBoard() {
  const t = useT();
  const [rows, setRows] = useState<BuilderCard[]>([]);
  const [form, setForm] = useState<BuilderKind | null>(null);
  const [opened, setOpened] = useState<BuilderCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await api.listBuilders();
      setRows(next);
      setOpened((prev) => (prev ? (next.find((item) => item.id === prev.id) ?? prev) : null));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (form) {
    return (
      <BuilderForm
        kind={form}
        onBack={() => setForm(null)}
        onDone={() => {
          setForm(null);
          void load();
        }}
      />
    );
  }

  if (opened) {
    return (
      <BuilderDetail
        card={opened}
        onBack={() => setOpened(null)}
        onRated={(next) => {
          setOpened(next);
          void load();
        }}
      />
    );
  }

  const offers = rows.filter((item) => item.kind === "offer");
  const jobs = rows.filter((item) => item.kind === "job");

  return (
    <View>
      <Pressable
        onPress={() => {
          setError(null);
          setForm("offer");
        }}
        accessibilityRole="button"
        className="mt-4 items-center rounded-2xl bg-brand py-3 active:opacity-90"
      >
        <Text className="text-base font-bold text-white">{t("build.offer")}</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          setError(null);
          setForm("job");
        }}
        accessibilityRole="button"
        className="mt-2 items-center rounded-2xl bg-[#012668] py-3 active:opacity-90"
      >
        <Text className="text-base font-bold text-white">{t("build.job")}</Text>
      </Pressable>
      {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}
      <Text className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{t("build.offer")}</Text>
      {offers.length === 0 ? <Empty text={t("build.empty_offer")} /> : offers.map((item) => <BuilderRow key={item.id} card={item} onPress={() => setOpened(item)} />)}
      <Text className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{t("build.job")}</Text>
      {jobs.length === 0 ? <Empty text={t("build.empty_job")} /> : jobs.map((item) => <BuilderRow key={item.id} card={item} onPress={() => setOpened(item)} />)}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View className="mt-2 rounded-3xl bg-white px-4 py-4">
      <Text className="text-sm text-muted">{text}</Text>
    </View>
  );
}

function BuilderRow({ card, onPress }: { card: BuilderCard; onPress: () => void }) {
  const t = useT();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="mt-2 overflow-hidden rounded-3xl bg-white active:opacity-90">
      <Cover photo={card.photo} />
      <View className="px-4 py-3">
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 pr-2 text-base font-bold text-ink">{card.kind === "offer" ? card.trade : card.name}</Text>
          <Score stars={card.stars} count={card.ratingCount} />
        </View>
        <Text className="mt-1 text-sm text-ink" numberOfLines={2}>
          {card.text}
        </Text>
        {card.kind === "job" ? (
          <View className="mt-2 flex-row items-start">
            <Ionicons name="location-sharp" size={15} color="#B54708" />
            <Text className="ml-1.5 flex-1 text-sm text-ink">{card.contactOpen ? card.address : t("build.locked_address")}</Text>
          </View>
        ) : null}
        <View className="mt-1.5 flex-row items-center">
          <Ionicons name="call-outline" size={15} color="#027A48" />
          <Text className="ml-1.5 text-sm font-semibold text-ink">{card.phone}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function BuilderDetail({
  card,
  onBack,
  onRated,
}: {
  card: BuilderCard;
  onBack: () => void;
  onRated: (next: BuilderCard) => void;
}) {
  const t = useT();
  const [phone, setPhone] = useState(formatUzPhone(""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const digits = card.phone.replace(/\D/g, "");

  async function rate(stars: number) {
    setBusy(true);
    setError(null);
    try {
      onRated(await api.rateBuilder(card.id, phone, stars));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mt-4">
      <Back onPress={onBack} label={t("build.back")} />
      <View className="overflow-hidden rounded-3xl bg-white">
        <Cover photo={card.photo} tall />
        <View className="px-4 py-3">
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 pr-2 text-xl font-bold text-ink">{card.kind === "offer" ? card.trade : card.name}</Text>
            <Score stars={card.stars} count={card.ratingCount} />
          </View>
          <Text className="mt-1 text-sm text-muted">{card.name}</Text>
          <Text className="mt-2 text-base leading-6 text-ink">{card.text}</Text>
          {card.address ? (
            <View className="mt-2 flex-row items-start">
              <Ionicons name="location-sharp" size={16} color="#B54708" />
              <Text className="ml-2 flex-1 text-base text-ink">{card.address}</Text>
            </View>
          ) : null}
          {card.contactOpen ? (
            <Pressable
              onPress={() => void Linking.openURL(`tel:+${digits}`)}
              accessibilityRole="button"
              className="mt-2 flex-row items-center self-start"
            >
              <Ionicons name="call-outline" size={16} color="#027A48" />
              <Text className="ml-2 text-base font-semibold text-brand">{card.phone}</Text>
            </Pressable>
          ) : (
            <Text className="mt-2 text-base font-semibold text-ink">{card.phone}</Text>
          )}
          {!card.contactOpen && card.kind === "job" ? <Text className="mt-1 text-sm text-muted">{t("build.locked_address")}</Text> : null}
        </View>
      </View>
      <View className="mt-3 rounded-3xl bg-white px-4 py-3">
        <Text className="text-sm font-semibold text-ink">{t("build.rate")}</Text>
        <TextInput
          value={phone}
          onChangeText={(value) => setPhone((prev) => editUzPhone(value, prev))}
          placeholder="+998"
          placeholderTextColor="#98A2B3"
          keyboardType="phone-pad"
          accessibilityLabel={t("build.rate_phone")}
          className="mt-2 rounded-2xl border border-line bg-[#F8FAFC] px-3 py-2.5 text-base text-ink"
        />
        <View className="mt-2 flex-row">
          {[1, 2, 3, 4, 5].map((star) => (
            <Pressable key={star} onPress={() => void rate(star)} disabled={busy} accessibilityRole="button" className="mr-1 p-1">
              <Ionicons name="star-outline" size={28} color="#F5C518" />
            </Pressable>
          ))}
        </View>
        {error ? <Text className="mt-1 text-sm text-red-600">{error}</Text> : null}
      </View>
    </View>
  );
}

function BuilderForm({ kind, onBack, onDone }: { kind: BuilderKind; onBack: () => void; onDone: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(formatUzPhone(""));
  const [trade, setTrade] = useState("");
  const [address, setAddress] = useState("");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickPhoto() {
    try {
      const uri = await takeProofPhoto();
      if (uri) setPhoto(uri);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.postBuilder({
        kind,
        name,
        phone,
        trade,
        address,
        text,
        photo,
      });
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mt-3">
      <Back onPress={onBack} label={t("build.back")} />
      <Text className="text-lg font-bold text-ink">{kind === "offer" ? t("build.offer") : t("build.job")}</Text>
      <Field label={t("auth.name")} value={name} onChange={setName} placeholder={t("auth.name_ph")} />
      <Field label={t("auth.phone")} value={phone} onChange={(value) => setPhone((prev) => editUzPhone(value, prev))} placeholder="+998" keyboard="phone-pad" />
      {kind === "offer" ? (
        <Field label={t("build.trade")} value={trade} onChange={setTrade} placeholder={t("build.trade_ph")} />
      ) : (
        <Field label={t("build.address")} value={address} onChange={setAddress} placeholder={t("build.address")} />
      )}
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
      <Pressable onPress={() => void pickPhoto()} accessibilityRole="button" className="mt-2 overflow-hidden rounded-2xl border border-line bg-white">
        {photo ? (
          <Image source={{ uri: photo }} style={{ width: "100%", height: 140 }} resizeMode="cover" />
        ) : (
          <View className="flex-row items-center justify-center py-4">
            <Ionicons name="image-outline" size={18} color="#155EEF" />
            <Text className="ml-2 text-sm font-semibold text-brand">{t("build.photo_add")}</Text>
          </View>
        )}
      </Pressable>
      {photo ? <Text className="mt-1 text-xs text-muted">{t("build.photo_change")}</Text> : null}
      {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}
      <Pressable
        onPress={() => void submit()}
        disabled={busy}
        accessibilityRole="button"
        className={`mt-3 items-center rounded-2xl py-3 ${busy ? "bg-slate-200" : "bg-brand active:opacity-90"}`}
      >
        <Text className={`text-base font-bold ${busy ? "text-slate-500" : "text-white"}`}>{t("build.send")}</Text>
      </Pressable>
    </View>
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
  keyboard?: "phone-pad";
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
        className="rounded-2xl border border-line bg-white px-3 py-2.5 text-base text-ink"
      />
    </View>
  );
}

function Cover({ photo, tall }: { photo: string | null; tall?: boolean }) {
  const height = tall ? 180 : 140;
  if (photo) {
    return <Image source={{ uri: photo }} style={{ width: "100%", height }} resizeMode="cover" />;
  }
  return (
    <View className="items-center justify-center bg-[#EEF4FF]" style={{ height }}>
      <Ionicons name="hammer" size={28} color="#155EEF" />
    </View>
  );
}

function Score({ stars, count }: { stars: number | null; count: number }) {
  if (stars == null || count === 0) return null;
  return (
    <View className="flex-row items-center">
      <Ionicons name="star" size={14} color="#F5C518" />
      <Text className="ml-1 text-sm font-bold text-ink">{stars}</Text>
    </View>
  );
}

function Back({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="mb-2 flex-row items-center self-start">
      <Ionicons name="chevron-back" size={18} color="#155EEF" />
      <Text className="ml-1 text-sm font-semibold text-brand">{label}</Text>
    </Pressable>
  );
}
