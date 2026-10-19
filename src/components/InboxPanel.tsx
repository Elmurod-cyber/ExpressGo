import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { InboxNote } from "../types";
import { useT } from "../context/Session";

export function InboxPanel({
  notes,
  onOpen,
  onReadAll,
  onClose,
}: {
  notes: InboxNote[];
  onOpen: (note: InboxNote) => void;
  onReadAll: () => void;
  onClose?: () => void;
}) {
  const t = useT();
  const open = notes.filter((note) => !note.read);
  return (
    <View className="mt-4 rounded-[28px] bg-card px-5 py-5">
      <View className="flex-row items-center justify-between">
        <Text className="text-xl font-bold text-ink">{t("inbox")}</Text>
        <View className="flex-row items-center">
          {open.length > 0 ? (
            <Pressable onPress={onReadAll} accessibilityRole="button" className="mr-3">
              <Text className="text-sm font-semibold text-brand">{t("inbox.read")}</Text>
            </Pressable>
          ) : null}
          {onClose ? (
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("close")}>
              <Ionicons name="close" size={22} color="#667085" />
            </Pressable>
          ) : null}
        </View>
      </View>
      {open.length === 0 ? (
        <View className="mt-6">
          <Text className="text-base font-semibold text-ink">{t("inbox.empty")}</Text>
          <Text className="mt-2 text-sm text-muted">{t("inbox.empty_hint")}</Text>
        </View>
      ) : (
        open.map((note) => (
          <Pressable
            key={note.id}
            onPress={() => onOpen(note)}
            accessibilityRole="button"
            className={`mt-3 rounded-2xl px-4 py-3 ${note.read ? "bg-canvas" : "bg-[#FFF6E5]"}`}
          >
            <View className="flex-row items-start justify-between">
              <Text className="flex-1 pr-2 text-sm font-bold text-ink">{note.title}</Text>
              <Text className="text-xs text-muted">{ago(note.at, t)}</Text>
            </View>
            <Text className="mt-1 text-sm text-muted">{note.body}</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

function ago(at: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const sec = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (sec < 20) return t("inbox.now");
  if (sec < 60) return t("inbox.sec", { n: sec });
  const min = Math.round(sec / 60);
  if (min < 60) return t("inbox.min", { n: min });
  return t("inbox.hour", { n: Math.round(min / 60) });
}
