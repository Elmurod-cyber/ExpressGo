import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "./Screen";
import { BrandMark } from "./BrandMark";
import { useSession, useT } from "../context/Session";
import { api } from "../services/api";
import { cardPhoneApply, cardPhoneCaret, cardPhoneMask, cardPhoneValue } from "../services/phoneMask";
import { useKeyboardOverlap } from "../services/keyboardInset";
import type { Role } from "../types";

type Step = "form" | "wait";

type TelegramAuthProps = {
  role: Role;
  username: string;
  onBack: () => void;
};

export function TelegramAuth({ role, username, onBack }: TelegramAuthProps) {
  const { signIn } = useSession();
  const t = useT();
  const insets = useSafeAreaInsets();
  const overlap = useKeyboardOverlap();
  const [step, setStep] = useState<Step>("form");
  const [digits, setDigits] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const finishing = useRef(false);
  const mask = cardPhoneMask(digits);
  const fieldValue = cardPhoneValue(digits);
  const caret = cardPhoneCaret(digits.length);
  const [selection, setSelection] = useState(caret);

  useEffect(() => {
    setSelection(cardPhoneCaret(digits.length));
  }, [digits]);

  async function openBot(id: string) {
    await Linking.openURL(`https://t.me/${username}?start=${id}`);
  }

  async function startTelegram() {
    if (digits.length < 9) return;
    setBusy(true);
    setError(null);
    try {
      const row = await api.beginTelegramSignup({ role, name: "Mijoz", phone: `998${digits}` });
      finishing.current = false;
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
        const session = await api.finishTelegramSignup({ id: challengeId! });
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
  }, [step, challengeId, signIn, t]);

  const bottom = Math.max(insets.bottom, 16) + overlap;
  const cut = digits.length >= 9 ? mask.length : caret.start;

  return (
    <Screen
      footer={
        <View className="px-5" style={{ paddingBottom: bottom }}>
          <View className="rounded-[28px] bg-card px-5 py-4">
            {error ? <Text className="mb-3 text-sm text-red-600">{error}</Text> : null}
            <Pressable
              onPress={step === "wait" && challengeId ? () => void openBot(challengeId) : () => void startTelegram()}
              disabled={step === "form" && (busy || digits.length < 9)}
              accessibilityRole="button"
              className={`items-center rounded-2xl py-4 ${step === "form" && (busy || digits.length < 9) ? "bg-slate-200" : "bg-[#121212] active:opacity-90"}`}
            >
              <Text
                className={`text-base font-semibold ${step === "form" && (busy || digits.length < 9) ? "text-slate-500" : "text-white"}`}
              >
                {busy ? t("auth.wait") : step === "wait" ? t("auth.telegram_open") : t("auth.telegram")}
              </Text>
            </Pressable>
          </View>
        </View>
      }
    >
      <View className="flex-1 px-5 pt-2">
        <View className="flex-row justify-end">
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t("close")} className="h-10 w-10 items-center justify-center">
            <Ionicons name="close" size={22} color="#98A2B3" />
          </Pressable>
        </View>
        <View className="items-center">
          <BrandMark size={88} />
          {step === "wait" ? <Text className="mt-6 text-center text-sm text-muted">{t("auth.telegram_wait")}</Text> : null}
        </View>
        {step === "form" ? (
          <View className="mt-8 rounded-[28px] bg-card px-5 py-6">
            <View className="justify-center rounded-2xl border border-line bg-canvas px-4 py-3.5">
              <Text className="text-base">
                <Text className="text-ink">{mask.slice(0, cut)}</Text>
                <Text className="text-muted">{mask.slice(cut)}</Text>
              </Text>
              <TextInput
                value={fieldValue}
                onChangeText={(next) => setDigits((prev) => cardPhoneApply(prev, next))}
                selection={selection}
                onSelectionChange={(event) => {
                  const want = cardPhoneCaret(digits.length);
                  const got = event.nativeEvent.selection;
                  if (got.start !== want.start || got.end !== want.end) setSelection(want);
                }}
                onFocus={() => setSelection(cardPhoneCaret(digits.length))}
                keyboardType="phone-pad"
                style={{ position: "absolute", left: 16, right: 16, top: 14, bottom: 14, color: "transparent", fontSize: 16, padding: 0 }}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
