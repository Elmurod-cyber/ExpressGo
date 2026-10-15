import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useT } from "../context/Session";
import { api } from "../services/api";
import { editUzPhone, formatUzPhone } from "../services/phoneMask";
import type { GuestPass } from "../types";

export function PhoneCodeBox({
  kind,
  title,
  hint,
  tone = "brand",
  onVerified,
}: {
  kind: "rider" | "employer" | "food";
  title: string;
  hint: string;
  tone?: "brand" | "orange";
  onVerified: (pass: GuestPass) => Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(formatUzPhone(""));
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [testCode, setTestCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const button = tone === "orange" ? "bg-[#C2410C]" : "bg-brand";

  async function send() {
    if (name.trim().length < 2 || phone.replace(/\D/g, "").length < 12) {
      setError(hint);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const challenge = await api.requestGuestCode(kind, phone);
      setTestCode(challenge.testCode ?? null);
      setSent(true);
      setCode("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("fail.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const pass = await api.verifyGuestCode(kind, phone, code, name.trim());
      await onVerified(pass);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("otp.fail"));
      setBusy(false);
    }
  }

  return (
    <View className="mt-4">
      <Text className="text-base font-bold text-ink">{title}</Text>
      <Text className="mt-1 text-sm text-muted">{hint}</Text>
      <Text className="mb-1.5 mt-3 text-sm font-medium text-ink">{t("auth.name")}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t("auth.name_ph")}
        placeholderTextColor="#98A2B3"
        editable={!sent}
        className="rounded-2xl bg-white px-4 py-3 text-base text-ink"
      />
      <Text className="mb-1.5 mt-3 text-sm font-medium text-ink">{t("auth.phone")}</Text>
      <TextInput
        value={phone}
        onChangeText={(value) => setPhone((prev) => editUzPhone(value, prev))}
        placeholder="+998"
        placeholderTextColor="#98A2B3"
        keyboardType="phone-pad"
        editable={!sent}
        className="rounded-2xl bg-white px-4 py-3 text-base text-ink"
      />
      {sent ? (
        <>
          <Text className="mt-3 text-sm text-muted">
            {testCode ? t("otp.test_hint", { code: testCode }) : t("otp.body", { phone })}
          </Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder={t("otp.code")}
            placeholderTextColor="#98A2B3"
            keyboardType="number-pad"
            className="mt-2 rounded-2xl bg-white px-4 py-3 text-base text-ink"
          />
        </>
      ) : null}
      {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}
      <Pressable
        onPress={() => void (sent ? confirm() : send())}
        disabled={busy}
        accessibilityRole="button"
        className={`mt-3 items-center rounded-2xl py-3 ${busy ? "bg-slate-200" : `${button} active:opacity-90`}`}
      >
        <Text className={`text-base font-bold ${busy ? "text-slate-500" : "text-white"}`}>{sent ? t("otp.ok") : t("otp.title")}</Text>
      </Pressable>
      {sent ? (
        <Pressable onPress={() => void send()} disabled={busy} accessibilityRole="button" className="mt-2 items-center py-2">
          <Text className="text-sm font-semibold text-brand">{t("otp.resend")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
