import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useSession, useT } from "../context/Session";
import { pingApi } from "../services/endpoint";

export function ServerUrlField() {
  const { apiUrl, setApiUrl } = useSession();
  const t = useT();
  const [draft, setDraft] = useState(apiUrl);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<boolean | null>(null);

  async function check() {
    setBusy(true);
    setOk(null);
    try {
      const next = draft.trim();
      if (!next) {
        setApiUrl("");
        setOk(null);
        return;
      }
      const good = await pingApi(next);
      setOk(good);
      if (good) setApiUrl(next);
    } finally {
      setBusy(false);
    }
  }

  const status =
    ok === true ? t("profile.server_ok") : ok === false ? t("profile.server_fail") : apiUrl || t("profile.server_local");

  return (
    <View className="mt-3">
      <Text className="mb-1 text-xs font-medium text-muted">{t("profile.server")}</Text>
      <View className="flex-row items-center">
        <TextInput
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            setOk(null);
          }}
          placeholder={t("profile.server_ph")}
          placeholderTextColor="#98A2B3"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          className="h-11 flex-1 rounded-xl border border-line bg-canvas px-3 text-sm text-ink"
        />
        <Pressable
          onPress={() => void check()}
          disabled={busy}
          accessibilityRole="button"
          className={`ml-2 h-11 justify-center rounded-xl px-3 ${busy ? "bg-slate-200" : "bg-[#121212] active:opacity-90"}`}
        >
          <Text className={`text-xs font-semibold ${busy ? "text-slate-500" : "text-white"}`}>
            {t("profile.server_check")}
          </Text>
        </Pressable>
      </View>
      <Text className="mt-1 text-xs leading-4 text-muted" numberOfLines={2}>
        {status}
        {" · "}
        {t("profile.server_hint")}
      </Text>
    </View>
  );
}
