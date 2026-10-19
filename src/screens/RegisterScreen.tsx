import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { BrandMark } from "../components/BrandMark";
import { useSession, useT } from "../context/Session";
import { api } from "../services/api";
import { editUzPhone, formatUzPhone } from "../services/phoneMask";
import type { OtpChallenge, Role } from "../types";

type AuthMode = "signup" | "login";

type RegisterScreenProps = {
  role: Role;
  onBack: () => void;
};

export function RegisterScreen({ role, onBack }: RegisterScreenProps) {
  const { signIn } = useSession();
  const t = useT();
  const [mode, setMode] = useState<AuthMode>("signup");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(formatUzPhone(""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState("");
  const signup = mode === "signup";

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (signup) {
        const account = await api.register({
          role,
          name,
          phone,
          vehicle: undefined,
        });
        setChallenge(await api.requestOtp({ role, phone: account.phone }));
      } else {
        setChallenge(await api.login({ role, phone }));
      }
      setCode("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : signup ? t("auth.fail_signup") : t("auth.fail_login"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmOtp() {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      const session = await api.verifyOtp({ role, phone: challenge.phone, code });
      await signIn(session.account, session.token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("otp.fail"));
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      setChallenge(await api.requestOtp({ role, phone: challenge.phone }));
      setCode("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("otp.fail"));
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <Screen>
        <View className="px-5 pt-2">
          <View className="flex-row justify-end">
            <Pressable
              onPress={() => {
                setChallenge(null);
                setCode("");
                setError(null);
              }}
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
            <Text className="text-center text-3xl font-bold text-ink">{t("otp.title")}</Text>
            <Text className="mt-2 text-center text-sm text-muted">
              {challenge.testCode ? t("otp.test_hint", { code: challenge.testCode }) : t("otp.body", { phone: challenge.phone })}
            </Text>
          </View>
          <View className="mt-6 rounded-[28px] bg-card px-5 py-6">
            {typeof __DEV__ !== "undefined" && __DEV__ ? (
              <Text className="mb-4 text-sm text-muted">{t("otp.dev_hint")}</Text>
            ) : null}
            <AuthField
              label={t("otp.code")}
              icon="call-outline"
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              keyboardType="number-pad"
            />
            {error ? <Text className="mb-4 text-sm text-red-600">{error}</Text> : null}
            <Pressable
              onPress={() => void confirmOtp()}
              disabled={busy || code.length < 4}
              accessibilityRole="button"
              className={`items-center rounded-2xl py-4 ${busy || code.length < 4 ? "bg-slate-200" : "bg-[#121212] active:opacity-90"}`}
            >
              <Text className={`text-base font-semibold ${busy || code.length < 4 ? "text-slate-500" : "text-white"}`}>
                {busy ? t("auth.wait") : t("otp.ok")}
              </Text>
            </Pressable>
            <Pressable onPress={() => void resendOtp()} disabled={busy} accessibilityRole="button" className="mt-4 items-center py-2">
              <Text className="text-sm font-semibold text-ink">{t("otp.resend")}</Text>
            </Pressable>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="px-5 pt-2">
        <View className="flex-row justify-end">
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t("close")} className="h-10 w-10 items-center justify-center">
            <Ionicons name="close" size={22} color="#98A2B3" />
          </Pressable>
        </View>

        <View className="items-center">
          <View className="mb-5">
            <BrandMark size={88} />
          </View>
          <Text className="text-center text-3xl font-bold text-ink">
            {signup ? t("auth.signup_title") : t("auth.login_title")}
          </Text>
          <Text className="mt-2 text-center text-sm text-muted">
            {signup ? t("auth.signup_sender") : t("auth.login_sub")}
          </Text>
        </View>

        <View className="mt-6 rounded-[28px] bg-card px-5 py-6">
          {signup ? (
            <AuthField
              label={t("auth.name")}
              icon="person-outline"
              value={name}
              onChangeText={setName}
              placeholder={t("auth.name_ph")}
            />
          ) : null}
          <AuthField
            label={t("auth.phone")}
            icon="call-outline"
            value={phone}
            onChangeText={(value) => setPhone((prev) => editUzPhone(value, prev))}
            placeholder="+998"
            keyboardType="phone-pad"
          />

          {error ? <Text className="mb-4 text-sm text-red-600">{error}</Text> : null}

          <Pressable
            onPress={() => void submit()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            className={`items-center rounded-2xl py-4 ${busy ? "bg-slate-200" : "bg-[#121212] active:opacity-90"}`}
          >
            <Text className={`text-base font-semibold ${busy ? "text-slate-500" : "text-white"}`}>
              {busy ? t("auth.wait") : signup ? t("auth.signup") : t("auth.login")}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => switchMode(signup ? "login" : "signup")}
          accessibilityRole="button"
          className="mt-6 items-center py-2"
        >
          <Text className="text-sm text-muted">
            {signup ? t("auth.have") : t("auth.need")}
            <Text className="font-semibold text-ink">{signup ? t("auth.login") : t("auth.create")}</Text>
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function AuthField({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
}: {
  label: string;
  icon: "person-outline" | "call-outline";
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "phone-pad" | "number-pad";
}) {
  return (
    <View className="mb-4">
      <Text className="mb-2 text-sm font-medium text-ink">{label}</Text>
      <View className="flex-row items-center rounded-2xl border border-line bg-card px-3">
        <Ionicons name={icon} size={18} color="#98A2B3" />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#98A2B3"
          keyboardType={keyboardType}
          className="ml-2 flex-1 py-3.5 text-base text-ink"
        />
      </View>
    </View>
  );
}
