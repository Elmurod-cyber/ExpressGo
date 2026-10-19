import { useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSession, useT } from "../context/Session";
import { LANGUAGE_SWITCH_ENABLED } from "../i18n";
import { LanguageSwitch } from "./LanguageSwitch";
import { api } from "../services/api";
import { editUzPhone, formatUzPhone } from "../services/phoneMask";

export function ProfilePanel({ onClose }: { onClose?: () => void }) {
  const { account, replaceAccount, signOut, pushOn, setPushOn } = useSession();
  const t = useT();
  const [name, setName] = useState(account?.name ?? "");
  const [phone, setPhone] = useState(formatUzPhone(account?.phone ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

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
    <View className="mt-3 rounded-3xl bg-card px-4 py-3">
      <View className="flex-row items-center">
        <View className="flex-1 pr-3">
          <Text className="text-base font-bold text-ink">{t("profile")}</Text>
          <Text className="text-xs text-muted">{t("profile.sender")}</Text>
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
          <View className={`h-5 w-5 rounded-full bg-card ${pushOn ? "self-end" : "self-start"}`} />
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="mt-3">
      <Text className="mb-1 text-xs font-medium text-muted">{label}</Text>
      {children}
    </View>
  );
}

