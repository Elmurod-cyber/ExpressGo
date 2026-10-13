import type { SupabaseClient } from "@supabase/supabase-js";
import { sharedState } from "../server/store";
import { getApiUrl } from "./endpoint";
import { getSupabase } from "./supabase";

type Row = { id: string; updatedAt?: number };

const ack = new Map<string, string>();
let chain: Promise<void> = Promise.resolve();
let timer: ReturnType<typeof setInterval> | null = null;
let client: SupabaseClient | null | undefined;
let warned = false;

function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  client = getSupabase();
  return client;
}

/** Mijozdan to'g'ridan-to'g'ri Supabase yozish yopildi. Buyurtma server orqali ketadi. */
const CLIENT_CLOUD_SYNC = false;

export function cloudEnabled(): boolean {
  return CLIENT_CLOUD_SYNC && supabase() != null && !getApiUrl();
}

function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.warn(message);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((key) => key !== "updatedAt" && obj[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stable(obj[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function asRow(body: unknown): Row | null {
  if (!body || typeof body !== "object") return null;
  const row = body as Row;
  if (typeof row.id !== "string" || !row.id) return null;
  return row;
}

async function loadTable(name: "eg_users" | "eg_orders" | "eg_chats" | "eg_notes"): Promise<Row[] | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.from(name).select("body");
  if (error) {
    warnOnce("Supabase jadvallari yo'q. supabase/expressgo.sql ni ishga tushiring.");
    return null;
  }
  const rows: Row[] = [];
  for (const item of data ?? []) {
    const row = asRow((item as { body?: unknown }).body);
    if (row) rows.push(row);
  }
  return rows;
}

function takeRemote<T extends Row>(local: T[], remote: Row[]) {
  for (const row of remote) {
    const index = local.findIndex((item) => item.id === row.id);
    if (index < 0) {
      local.push(row as T);
      ack.set(row.id, stable(row));
      continue;
    }
    const current = local[index];
    const dirty = ack.get(current.id) !== stable(current);
    const remoteAt = row.updatedAt ?? 0;
    const localAt = current.updatedAt ?? 0;
    if ((!dirty && remoteAt >= localAt) || (dirty && remoteAt > localAt)) {
      Object.assign(current, row);
      ack.set(current.id, stable(current));
    }
  }
}

async function pushTable(name: "eg_users" | "eg_orders" | "eg_chats" | "eg_notes", local: Row[]) {
  const db = supabase();
  if (!db) return;
  const dirty = local.filter((row) => ack.get(row.id) !== stable(row));
  if (!dirty.length) return;
  const now = Date.now();
  for (const row of dirty) {
    if ((row.updatedAt ?? 0) < now) row.updatedAt = now;
  }
  const { error } = await db.from(name).upsert(
    dirty.map((row) => ({ id: row.id, updated_at: row.updatedAt ?? now, body: row })),
    { onConflict: "id" },
  );
  if (error) {
    warnOnce("Supabase jadvallari yo'q. supabase/expressgo.sql ni ishga tushiring.");
    return;
  }
  for (const row of dirty) ack.set(row.id, stable(row));
}

async function pullShared() {
  if (!cloudEnabled()) return;
  const [users, orders, chats, notes] = await Promise.all([
    loadTable("eg_users"),
    loadTable("eg_orders"),
    loadTable("eg_chats"),
    loadTable("eg_notes"),
  ]);
  const state = sharedState();
  if (users && orders && chats) {
    takeRemote(state.users, users);
    takeRemote(state.orders, orders);
    takeRemote(state.chats, chats);
  }
  if (notes) takeRemote(state.notes, notes);
}

async function pushSharedNow() {
  if (!cloudEnabled()) return;
  const state = sharedState();
  await pushTable("eg_users", state.users);
  await pushTable("eg_orders", state.orders);
  await pushTable("eg_chats", state.chats);
  await pushTable("eg_notes", state.notes);
}

function enqueue(work: () => Promise<void>) {
  if (!cloudEnabled()) return;
  chain = chain.then(work).catch((error: unknown) => {
    warnOnce(error instanceof Error ? error.message : "Supabase yozilmadi.");
  });
}

export function pushShared() {
  enqueue(() => pushSharedNow());
}

export function startCloudSync() {
  if (!supabase() || timer) return;
  enqueue(async () => {
    await pullShared();
    await pushSharedNow();
  });
  timer = setInterval(() => {
    enqueue(async () => {
      await pullShared();
      await pushSharedNow();
    });
  }, 2000);
}
