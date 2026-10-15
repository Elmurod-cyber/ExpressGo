import { useState, type ReactNode } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSession, useT } from "../context/Session";
import { LANGUAGE_SWITCH_ENABLED } from "../i18n";
import { LanguageSwitch } from "./LanguageSwitch";
import { api } from "../services/api";
import { formatMoney } from "../services/money";
import { takeProofPhoto } from "../services/photo";
import { editUzPhone, formatUzPhone } from "../services/phoneMask";
import { DOC_LABEL, VEHICLE_LABEL } from "../server/rules";
import type { CourierDocKind, CourierDocs, DocStatus } from "../types";

export function ProfilePanel({ onClose }: { onClose?: () => void }) {
  const { account, replaceAccount, signOut, pushOn, setPushOn } = useSession();
  const t = useT();
  const [name, setName] = useState(account?.name ?? "");
  const [phone, setPhone] = useState(formatUzPhone(account?.phone ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  async function uploadDoc(kind: CourierDocKind) {
    if (!account) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const uri = await takeProofPhoto();
      if (!uri) return;
      replaceAccount(await api.submitCourierDoc(account.id, kind, uri));
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saved_fail"));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      replaceAccount(await api.updateProfile(account.id, { name, phone }));
      if (onClose) onClose();
      else setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saved_fail"));
    } finally {
      setBusy(false);
    }
  }

  if (!account) return null;

  return (
    <View className="mt-3 rounded-3xl bg-white px-4 py-3">
      <View className="flex-row items-center">
        <View className="flex-1 pr-3">
          <Text className="text-base font-bold text-ink">{t("profile")}</Text>
          <Text className="text-xs text-muted">
            {account.role === "courier" ? t("profile.courier") : t("profile.sender")}
          </Text>
        </View>
        {LANGUAGE_SWITCH_ENABLED ? <LanguageSwitch flush /> : null}
        {onClose ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t("close")}
            className="ml-2 h-8 w-8 items-center justify-center"
          >
            <Ionicons name="close" size={20} color="#667085" />
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={() => setPushOn(!pushOn)}
        accessibilityRole="switch"
        accessibilityState={{ checked: pushOn }}
        className="mt-3 flex-row items-center rounded-xl bg-canvas px-3 py-2"
      >
        <View className="flex-1 pr-3">
          <Text className="text-sm font-semibold text-ink">{t("profile.push")}</Text>
          <Text className="text-xs leading-4 text-muted" numberOfLines={2}>
            {pushOn ? t("profile.push_on") : t("profile.push_off")}
          </Text>
        </View>
        <View className={`h-6 w-11 justify-center rounded-full px-0.5 ${pushOn ? "bg-[#12B76A]" : "bg-slate-300"}`}>
          <View className={`h-5 w-5 rounded-full bg-white ${pushOn ? "self-end" : "self-start"}`} />
        </View>
      </Pressable>

      <Field label={t("auth.name")}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("auth.name_ph")}
          placeholderTextColor="#98A2B3"
          className="h-11 rounded-xl border border-line bg-canvas px-3 text-sm text-ink"
        />
      </Field>
      <Field label={t("auth.phone")}>
        <TextInput
          value={phone}
          onChangeText={(value) => setPhone((prev) => editUzPhone(value, prev))}
          placeholder="+998"
          placeholderTextColor="#98A2B3"
          keyboardType="phone-pad"
          className="h-11 rounded-xl border border-line bg-canvas px-3 text-sm text-ink"
        />
      </Field>

      {account.role === "courier" && account.docs ? (
        <CourierDocsBlock
          docs={account.docs}
          open={docsOpen}
          onToggle={() => setDocsOpen((value) => !value)}
          busy={busy}
          onUpload={(kind) => void uploadDoc(kind)}
          meta={`${t("admin.dep", { money: formatMoney(account.balance ?? 0) })}${account.vehicle ? ` · ${VEHICLE_LABEL[account.vehicle]}` : ""}${account.shiftOn ? ` · ${t("profile.shift_on")}` : ` · ${t("profile.shift_off")}`}`}
        />
      ) : null}

      {error ? <Text className="mt-2 text-xs text-red-600">{error}</Text> : null}
      {saved && !error ? <Text className="mt-2 text-xs font-semibold text-brand">{t("saved_ok")}</Text> : null}

      <Pressable
        onPress={() => void save()}
        disabled={busy}
        accessibilityRole="button"
        className={`mt-3 h-11 items-center justify-center rounded-xl ${busy ? "bg-slate-200" : "bg-[#121212] active:opacity-90"}`}
      >
        <Text className={`text-sm font-semibold ${busy ? "text-slate-500" : "text-white"}`}>
          {busy ? t("saving") : t("save")}
        </Text>
      </Pressable>

      <Pressable onPress={signOut} accessibilityRole="button" className="mt-1 h-10 items-center justify-center">
        <Text className="text-sm font-semibold text-red-600">{t("logout")}</Text>
      </Pressable>
    </View>
  );
}

function CourierDocsBlock({
  docs,
  open,
  onToggle,
  busy,
  onUpload,
  meta,
}: {
  docs: CourierDocs;
  open: boolean;
  onToggle: () => void;
  busy: boolean;
  onUpload: (kind: CourierDocKind) => void;
  meta: string;
}) {
  const t = useT();
  const approved = docs.needed.filter((kind) => docs.status[kind] === "approved");
  const waiting = docs.needed.filter((kind) => docs.status[kind] !== "approved");
  return (
    <View className="mt-3">
      <Pressable
        onPress={approved.length > 0 ? onToggle : undefined}
        accessibilityRole={approved.length > 0 ? "button" : undefined}
        className="flex-row items-center"
      >
        <Text className="flex-1 text-xs font-medium text-muted">
          {t("duty.docs", { a: docs.readyCount, b: docs.needCount })}
        </Text>
        {approved.length > 0 ? (
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color="#98A2B3" />
        ) : null}
      </Pressable>
      {waiting.map((kind) => (
        <DocRow
          key={kind}
          kind={kind}
          uri={docs[kind]}
          status={docs.status[kind]}
          note={docs.notes[kind]}
          disabled={busy}
          onPress={() => onUpload(kind)}
        />
      ))}
      {open
        ? approved.map((kind) => (
            <DocRow
              key={kind}
              kind={kind}
              uri={docs[kind]}
              status={docs.status[kind]}
              note={docs.notes[kind]}
              disabled={busy}
              onPress={() => onUpload(kind)}
            />
          ))
        : null}
      <Text className="mt-2 text-xs text-muted">{meta}</Text>
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="mt-3">
      <Text className="mb-1 text-xs font-medium text-muted">{label}</Text>
      {children}
    </View>
  );
}

function DocRow({
  kind,
  uri,
  status,
  note,
  disabled,
  onPress,
}: {
  kind: CourierDocKind;
  uri: string | null;
  status: DocStatus;
  note: string | null;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useT();
  const hint =
    status === "approved"
      ? t("doc.approved")
      : status === "pending"
        ? t("duty.reviewing")
        : status === "rejected"
          ? t("duty.rejected", { why: note ? ` · ${note}` : "" })
          : t("duty.take_photo");
  const icon =
    status === "approved"
      ? "checkmark-circle"
      : status === "pending"
        ? "time-outline"
        : status === "rejected"
          ? "close-circle"
          : "chevron-forward";
  const color =
    status === "approved" ? "#12B76A" : status === "pending" ? "#C47E09" : status === "rejected" ? "#D92D20" : "#98A2B3";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={DOC_LABEL[kind]}
      className="mt-1.5 flex-row items-center rounded-xl bg-canvas px-2.5 py-2"
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: 36, height: 36, borderRadius: 10 }} />
      ) : (
        <View className="h-9 w-9 items-center justify-center rounded-lg bg-white">
          <Ionicons name="camera-outline" size={16} color="#667085" />
        </View>
      )}
      <View className="ml-2.5 flex-1">
        <Text className="text-sm font-semibold text-ink">{DOC_LABEL[kind]}</Text>
        <Text className={`text-xs ${status === "rejected" ? "text-red-600" : "text-muted"}`}>{hint}</Text>
      </View>
      <Ionicons name={icon} size={18} color={color} />
    </Pressable>
  );
}
