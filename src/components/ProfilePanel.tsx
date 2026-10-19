import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSession, useT } from "../context/Session";
import { ThemeSwitch } from "./ThemeSwitch";
import { AdminEntry } from "./DemoDock";
import { api } from "../services/api";
import { editUzPhone, formatUzPhone } from "../services/phoneMask";
import { useNight } from "../services/theme";

export function ProfilePanel({
  onBack,
  onClose,
  docked = false,
}: {
  onBack?: () => void;
  onClose?: () => void;
  docked?: boolean;
}) {
  const { account, replaceAccount, signOut, pushOn, setPushOn } = useSession();
  const t = useT();
  const night = useNight();
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!account) return null;

  async function pickPhoto(from: "library" | "camera") {
    setSheet(false);
    const permission =
      from === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(t("profile.photo_need"));
      return;
    }
    const picked =
      from === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.35, base64: true, allowsEditing: true, aspect: [1, 1] })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.35, base64: true, allowsEditing: true, aspect: [1, 1] });
    const shot = picked.canceled ? "" : picked.assets[0]?.base64 ?? "";
    if (!shot) return;
    const uri = `data:image/jpeg;base64,${shot}`;
    if (uri.length > 400_000) {
      setError(t("build.photo_big"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      replaceAccount(await api.updateProfile(account!.id, { photo: uri }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saved_fail"));
    } finally {
      setBusy(false);
    }
  }

  const photoMenu = (
    <Modal visible={sheet} transparent animationType="fade" onRequestClose={() => setSheet(false)}>
      <View className="flex-1 justify-end">
        <Pressable accessibilityRole="button" onPress={() => setSheet(false)} className="absolute inset-0 bg-black/50" />
        <View className="px-3 pb-8">
          <View className="overflow-hidden rounded-2xl bg-card">
            <SheetAction icon="images-outline" label={t("profile.photo_gallery")} onPress={() => void pickPhoto("library")} />
            <View className="mx-4 h-px bg-line" />
            <SheetAction icon="camera-outline" label={t("profile.photo_camera")} onPress={() => void pickPhoto("camera")} />
          </View>
          <Pressable
            onPress={() => setSheet(false)}
            accessibilityRole="button"
            className="mt-2 items-center rounded-2xl bg-card py-4 active:opacity-90"
          >
            <Text className="text-base font-bold text-[#FF8A00]">{t("cancel")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  if (editing) {
    return (
      <EditProfile
        name={account.name}
        phone={formatUzPhone(account.phone)}
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }

  const body = (
    <>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t("profile.back")} className="mb-3 flex-row items-center self-start">
          <Ionicons name="chevron-back" size={20} color="#FF8A00" />
          <Text className="ml-1 text-sm font-semibold text-[#FF8A00]">{t("profile.back")}</Text>
        </Pressable>
      ) : null}
      <View className="rounded-3xl bg-card px-4 py-3">
        <View className="flex-row items-center">
          <View className="flex-1 pr-3">
            <Text className="text-base font-bold text-ink">{t("profile")}</Text>
            <Text className="text-xs text-muted">{t("profile.sender")}</Text>
          </View>
          <ThemeSwitch compact />
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

        <View className="mt-4 flex-row items-center">
          <Pressable
            onPress={() => setSheet(true)}
            accessibilityRole="button"
            accessibilityLabel={t("profile")}
            className="h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-canvas"
          >
            {account.photo ? (
              <Image source={{ uri: account.photo }} style={{ width: 56, height: 56 }} />
            ) : (
              <Ionicons name="person-outline" size={26} color="#FF8A00" />
            )}
          </Pressable>
          <Pressable
            onPress={() => setEditing(true)}
            accessibilityRole="button"
            accessibilityLabel={t("profile.edit_title")}
            className="ml-3 min-w-0 flex-1 flex-row items-center"
          >
            <View className="min-w-0 flex-1">
              <Text className="text-lg font-bold text-ink" numberOfLines={1}>
                {account.name}
              </Text>
              <View className="mt-1 flex-row items-center">
                <Ionicons name="call-outline" size={14} color={night ? "#C8C8C8" : "#667085"} />
                <Text className="ml-1 flex-1 text-sm text-muted" numberOfLines={1}>
                  {formatUzPhone(account.phone)}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={night ? "#C8C8C8" : "#98A2B3"} />
          </Pressable>
        </View>
        {error ? <Text className="mt-2 text-xs text-red-600">{error}</Text> : null}
      </View>

      <Text className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">{t("profile.settings")}</Text>
      <View className="overflow-hidden rounded-3xl bg-card">
        <Pressable
          onPress={() => setPushOn(!pushOn)}
          accessibilityRole="switch"
          accessibilityState={{ checked: pushOn }}
          className="flex-row items-center px-4 py-3"
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
        <AdminEntry grouped />
      </View>
      {busy ? <Text className="mt-2 text-xs text-muted">{t("saving")}</Text> : null}
    </>
  );

  const logout = (
    <Pressable
      onPress={signOut}
      accessibilityRole="button"
      className="mt-3 h-12 flex-row items-center justify-center rounded-2xl bg-[#F4F6FB] active:opacity-90"
    >
      <Ionicons name="person-outline" size={18} color="#F04438" />
      <Text className="ml-2 text-base font-semibold text-[#F04438]">{t("logout")}</Text>
    </Pressable>
  );

  if (!docked) {
    return (
      <View>
        {body}
        {logout}
        {photoMenu}
      </View>
    );
  }

  return (
    <View className="min-h-0 flex-1">
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {body}
      </ScrollView>
      <View className="pt-2">{logout}</View>
      {photoMenu}
    </View>
  );
}

function EditProfile({
  name,
  phone,
  onCancel,
  onSaved,
}: {
  name: string;
  phone: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { account, replaceAccount } = useSession();
  const t = useT();
  const night = useNight();
  const [draftName, setDraftName] = useState(name);
  const [draftPhone, setDraftPhone] = useState(phone);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!account || busy) return;
    setBusy(true);
    setError(null);
    try {
      replaceAccount(await api.updateProfile(account.id, { name: draftName, phone: draftPhone }));
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saved_fail"));
      setBusy(false);
    }
  }

  return (
    <View className="min-h-0 flex-1">
      <View className="mb-4 flex-row items-center">
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel={t("profile.back")} className="h-10 w-10 items-center justify-center">
          <Ionicons name="chevron-back" size={22} color="#FF8A00" />
        </Pressable>
        <Text className="flex-1 text-center text-base font-bold text-ink">{t("profile.edit_title")}</Text>
        <View className="h-10 w-10" />
      </View>
      <Text className="mb-1 text-xs font-medium text-muted">{t("auth.name")}</Text>
      <TextInput
        value={draftName}
        onChangeText={setDraftName}
        placeholder={t("auth.name_ph")}
        placeholderTextColor="#98A2B3"
        className="h-12 rounded-xl border border-line bg-card px-3 text-base text-ink"
      />
      <Text className="mb-1 mt-3 text-xs font-medium text-muted">{t("auth.phone")}</Text>
      <TextInput
        value={draftPhone}
        onChangeText={(value) => setDraftPhone((prev) => editUzPhone(value, prev))}
        placeholder="+998"
        placeholderTextColor="#98A2B3"
        keyboardType="phone-pad"
        className="h-12 rounded-xl border border-line bg-card px-3 text-base text-ink"
      />
      {error ? <Text className="mt-2 text-xs text-red-600">{error}</Text> : null}
      <View className="mt-auto pt-6">
        <Pressable
          onPress={() => void save()}
          disabled={busy}
          accessibilityRole="button"
          className={`h-12 items-center justify-center rounded-xl ${busy ? "bg-slate-200" : "bg-[#FF8A00] active:opacity-90"}`}
        >
          <Text className={`text-base font-bold ${busy ? "text-slate-500" : "text-[#171717]"}`}>{busy ? t("saving") : t("save")}</Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          className={`mt-2 h-12 items-center justify-center rounded-xl border ${night ? "border-[#3A3A3A]" : "border-line"}`}
        >
          <Text className="text-base font-semibold text-ink">{t("cancel")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SheetAction({
  icon,
  label,
  onPress,
}: {
  icon: "images-outline" | "camera-outline";
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="flex-row items-center px-4 py-4 active:opacity-80">
      <Ionicons name={icon} size={22} color="#FF8A00" />
      <Text className="ml-3 text-base font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}
