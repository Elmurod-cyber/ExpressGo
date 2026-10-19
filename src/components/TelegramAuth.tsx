import { useEffect, useState } from "react";
import { AppState, Linking, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "./Screen";
import { BrandMark } from "./BrandMark";
import { useSession, useT } from "../context/Session";
import { api } from "../services/api";
import { editUzPhone, formatUzPhone } from "../services/phoneMask";
import type { Role } from "../types";

type AuthMode = "signup" | "login";
type Step = "form" | "wait" | "password";

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
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  function resetForm(next: AuthMode) {
    setMode(next);
    setStep("form");
    setChallengeId(null);
    setPassword("");
    setAgain("");
    setError(null);
  }

  async function openBot(id: string) {
    await Linking.openURL(`https://t.me/${username}?start=${id}`);
  }

  async function startTelegram(purpose: "signup" | "reset") {
    setBusy(true);
    setError(null);
    try {
      const row =
        purpose === "signup"
          ? await api.beginTelegramSignup({ role, name, phone })
          : await api.beginPasswordReset({ role, phone });
      setChallengeId(row.id);
      setStep("wait");
      await openBot(row.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.fail_signup"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (step !== "wait" || !challengeId) return;
    let stop = false;
    async function poll() {
      try {
        const row = await api.telegramSignupStatus(challengeId!);
        if (stop) return;
        if (row.state === "confirmed") setStep("password");
        if (row.state === "expired") {
          setError(t("otp.fail"));
          setStep("form");
        }
      } catch {
        // Keyingi urinishda qayta so'raladi.
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
  }, [step, challengeId, t]);

  async function savePassword() {
    if (!challengeId) return;
    if (password.trim() !== again.trim()) {
      setError(t("auth.password_mismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session =
        mode === "signup"
          ? await api.finishTelegramSignup({ id: challengeId, password })
          : await api.finishPasswordReset({ id: challengeId, password });
      await signIn(session.account, session.token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.fail_signup"));
    } finally {
      setBusy(false);
    }
  }

  async function enter() {
    setBusy(true);
    setError(null);
    try {
      const session = await api.loginWithPassword({ role, phone, password });
      await signIn(session.account, session.token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.fail_login"));
    } finally {
      setBusy(false);
    }
  }

  const title = step === "password" ? t("auth.set_password") : signup ? t("auth.signup_title") : t("auth.login_title");

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
          <Text className="text-center text-3xl font-bold text-ink">{title}</Text>
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
          {step === "form" && !signup ? (
            <Field label={t("auth.password")} value={password} onChangeText={setPassword} placeholder={t("auth.password_ph")} secure />
          ) : null}
          {step === "password" ? (
            <>
              <Field label={t("auth.password")} value={password} onChangeText={setPassword} placeholder={t("auth.password_ph")} secure />
              <Field label={t("auth.password_again")} value={again} onChangeText={setAgain} placeholder={t("auth.password_ph")} secure />
            </>
          ) : null}
          {error ? <Text className="mb-4 text-sm text-red-600">{error}</Text> : null}

          {step === "form" && signup ? (
            <DarkButton label={busy ? t("auth.wait") : t("auth.telegram")} disabled={busy} onPress={() => void startTelegram("signup")} />
          ) : null}
          {step === "form" && !signup ? (
            <>
              <DarkButton label={busy ? t("auth.wait") : t("auth.login")} disabled={busy || password.trim().length < 6} onPress={() => void enter()} />
              <Pressable onPress={() => void startTelegram("reset")} disabled={busy} accessibilityRole="button" className="mt-4 items-center py-2">
                <Text className="text-sm font-semibold text-ink">{t("auth.forgot")}</Text>
              </Pressable>
            </>
          ) : null}
          {step === "wait" && challengeId ? (
            <DarkButton label={t("auth.telegram_open")} disabled={false} onPress={() => void openBot(challengeId)} />
          ) : null}
          {step === "password" ? (
            <DarkButton
              label={busy ? t("auth.wait") : t("auth.set_password")}
              disabled={busy || password.trim().length < 6 || again.trim().length < 6}
              onPress={() => void savePassword()}
            />
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
  secure,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "phone-pad";
  secure?: boolean;
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
        secureTextEntry={secure}
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
