import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../services/api";
import type { ChatMessage, JobKind } from "../types";
import { useT } from "../context/Session";

export function ChatBox({
  userId,
  jobId,
  jobKind,
  expanded = false,
}: {
  userId: string;
  jobId: string;
  jobKind: JobKind;
  expanded?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(expanded);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const ok = await api.canChat(userId, jobId, jobKind);
      setAllowed(ok);
      if (ok) setMessages(await api.listChat(userId, jobId, jobKind));
    } catch {
      setAllowed(false);
    }
  }, [userId, jobId, jobKind]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open && !expanded) return;
    const id = setInterval(() => void load(), 2000);
    return () => clearInterval(id);
  }, [open, expanded, load]);

  async function send() {
    const next = text.trim();
    if (!next) return;
    try {
      setMessages(await api.sendChat(userId, jobId, jobKind, next));
      setText("");
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("chat.fail"));
    }
  }

  const thread = (
    <>
      <View className={expanded ? "" : "mt-3"}>
        {messages.length === 0 ? (
          <Text className="text-xs text-muted">{t("chat.empty")}</Text>
        ) : (
          messages.map((item) => {
            const mine = item.fromId === userId;
            return (
              <View key={item.id} className={`mb-2 max-w-[90%] rounded-2xl px-3 py-2 ${mine ? "self-end bg-[#121212]" : "self-start bg-white"}`}>
                <Text className={`text-sm ${mine ? "text-white" : "text-ink"}`}>{item.text}</Text>
              </View>
            );
          })
        )}
      </View>
      {error ? <Text className="mb-2 text-xs text-red-600">{error}</Text> : null}
      <View className="mt-1 flex-row items-center rounded-2xl border border-line bg-canvas px-3">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t("chat.ph")}
          placeholderTextColor="#98A2B3"
          className="flex-1 py-2.5 text-sm text-ink"
        />
        <Pressable onPress={() => void send()} accessibilityRole="button" accessibilityLabel={t("chat.send")}>
          <Ionicons name="send" size={18} color="#155EEF" />
        </Pressable>
      </View>
    </>
  );

  if (!allowed) {
    return expanded ? <Text className="mt-4 text-sm text-muted">{t("chat.closed")}</Text> : null;
  }

  if (expanded) {
    return <View className="mt-2 rounded-3xl bg-white px-4 py-4">{thread}</View>;
  }

  return (
    <View className="mt-3 rounded-2xl border border-line bg-[#F7F8FB] px-4 py-3">
      <Pressable
        onPress={() => setOpen((prev) => !prev)}
        accessibilityRole="button"
        className="flex-row items-center justify-between"
      >
        <View className="flex-row items-center">
          <Ionicons name="chatbubble-ellipses-outline" size={16} color="#101828" />
          <Text className="ml-2 text-sm font-semibold text-ink">{t("chat")}</Text>
        </View>
        <Text className="text-xs text-muted">{open ? t("close") : t("chat")}</Text>
      </Pressable>
      {open ? thread : null}
    </View>
  );
}
