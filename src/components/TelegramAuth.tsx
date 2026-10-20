import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "./Screen";
import { BrandMark } from "./BrandMark";
import { useSession, useT } from "../context/Session";
import { api } from "../services/api";
import { editUzPhone, formatUzPhone } from "../services/phoneMask";
import type { Role } from "../types";

type AuthMode = "signup" | "login";
type Step = "form" | "wait";

type TelegramAuthProps = {
  role: Role;
  username: string;
  onBack: () => void;
};

export function TelegramAuth({ role, username, onBack }: TelegramAuthProps) {
  const { signIn } = useSession();
  const t = useT();
  const [mode, setMode] = useState<AuthMode>("signup");
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(formatUzPhone(""));
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const finishing = useRef(false);
  const signup = mode === "signup";

  function resetForm(next: AuthMode) {
    finishing.current = false;
    setMode(next);
    setStep("form");
    setChallengeId(null);
    setError(null);
  }

  async function openBot(id: string) {
    await Linking.openURL(`https://t.me/${username}?start=${id}`);
  }

  async function startTelegram() {
    setBusy(true);
    setError(null);
    try {
      const row = signup
        ? await api.beginTelegramSignup({ role, name, phone })
        : await api.beginPasswordReset({ role, phone });
      finishing.current = false;
      setChallengeId(row.id);
      setStep("wait");
      await openBot(row.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t(signup ? "auth.fail_signup" : "auth.fail_login"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (step !== "wait" || !challengeId) return;
    let stop = false;
    async function poll() {
      if (finishing.current) return;
      try {
        const row = await api.telegramSignupStatus(challengeId!);
        if (stop || finishing.current) return;
        if (row.state === "expired") {
          setError(t("otp.fail"));
          setStep("form");
          return;
        }
        if (row.state !== "confirmed") return;
        finishing.current = true;
        const session = signup
          ? await api.finishTelegramSignup({ id: challengeId! })
          : await api.finishPasswordReset({ id: challengeId! });
        if (!stop) await signIn(session.account, session.token);
      } catch (caught) {
        finishing.current = false;
        if (!stop) setError(caught instanceof Error ? caught.message : t("auth.fail_login"));
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void poll();
    });
    return () => {
      stop = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [step, challengeId, signup, signIn, t]);

  return (
    <Screen>
      <View className="px-5 pt-2">
        <View className="flex-row justify-end">
          <Pressable
            onPress={step === "form" ? onBack : () => resetForm(mode)}
            accessibilityRole="button"
            accessibilityLabel={t("close")}
            className="h-10 w-10 items-center justify-center"
          >
            <Ionicons name="close" size={22} color="#98A2B3" />
          </Pressable>
        </View>
        <View className="items-center">
          <View className="mb-5">
            <BrandMark size={88} />
          </View>
          <Text className="text-center text-3xl font-bold text-ink">{signup ? t("auth.signup_title") : t("auth.login_title")}</Text>
          <Text className="mt-2 text-center text-sm text-muted">
            {step === "wait" ? t("auth.telegram_wait") : signup ? t("auth.signup_sender") : t("auth.login_sub")}
          </Text>
        </View>

        <View className="mt-6 rounded-[28px] bg-card px-5 py-6">
          {step === "form" && signup ? (
            <Field label={t("auth.name")} value={name} onChangeText={setName} placeholder={t("auth.name_ph")} />
          ) : null}
          {step === "form" ? (
            <Field
              label={t("auth.phone")}
              value={phone}
              onChangeText={(value) => setPhone((prev) => editUzPhone(value, prev))}
              placeholder="+998"
              keyboardType="phone-pad"
            />
          ) : null}
          {error ? <Text className="mb-4 text-sm text-red-600">{error}</Text> : null}
          {step === "form" ? (
            <DarkButton label={busy ? t("auth.wait") : t("auth.telegram")} disabled={busy} onPress={() => void startTelegram()} />
          ) : null}
          {step === "wait" && challengeId ? (
            <DarkButton label={t("auth.telegram_open")} disabled={false} onPress={() => void openBot(challengeId)} />
          ) : null}
        </View>

        {step === "form" ? (
          <Pressable onPress={() => resetForm(signup ? "login" : "signup")} accessibilityRole="button" className="mt-6 items-center py-2">
            <Text className="text-sm text-muted">
              {signup ? t("auth.have") : t("auth.need")}
              <Text className="font-semibold text-ink">{signup ? t("auth.login") : t("auth.create")}</Text>
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "phone-pad";
}) {
  return (
    <View className="mb-4">
      <Text className="mb-2 text-sm font-medium text-ink">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#98A2B3"
        keyboardType={keyboardType}
        autoCapitalize="none"
        className="rounded-2xl border border-line bg-canvas px-4 py-3.5 text-base text-ink"
      />
    </View>
  );
}

function DarkButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`items-center rounded-2xl py-4 ${disabled ? "bg-slate-200" : "bg-[#121212] active:opacity-90"}`}
    >
      <Text className={`text-base font-semibold ${disabled ? "text-slate-500" : "text-white"}`}>{label}</Text>
    </Pressable>
  );
}
