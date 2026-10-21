import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { api } from "../services/api";
import type { InboxBundle } from "../types";
import { useSession } from "../context/Session";
import { notifyLocal } from "../services/push";

const empty: InboxBundle = { notes: [], unread: 0 };

export function useInbox(userId?: string | null, quiet = false) {
  const { pushOn } = useSession();
  const [inbox, setInbox] = useState<InboxBundle>(empty);
  const seen = useRef(new Set<string>());
  const primed = useRef(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setInbox(empty);
      seen.current.clear();
      primed.current = false;
      return;
    }
    try {
      const next = await api.listInbox(userId);
      if (!quiet && primed.current && pushOn && AppState.currentState === "active") {
        for (const note of next.notes) {
          if (!seen.current.has(note.id) && !note.read) {
            void notifyLocal(note.title, note.body);
          }
        }
      }
      for (const note of next.notes) seen.current.add(note.id);
      primed.current = true;
      setInbox(next);
    } catch {
      // Keyingi urinishda.
    }
  }, [userId, pushOn, quiet]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!userId) return;
    const id = setInterval(() => void reload(), 2000);
    return () => clearInterval(id);
  }, [userId, reload]);

  async function markRead(noteId?: string | null) {
    if (!userId) return;
    setInbox(await api.markInboxRead(userId, noteId));
  }

  return { inbox, reload, markRead };
}
