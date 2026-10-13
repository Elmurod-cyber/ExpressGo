import { getSupabase } from "./supabase";
import type { Account, CourierBoard, CourierOrder, OrderProof, JobTiming } from "../types";

const PREFIX = "pb:";

export type DeliveryRow = {
  id: string;
  probazar_order_id: string;
  status: "posted" | "accepted" | "picked_up" | "delivered" | "cancelled";
  from_name: string;
  from_phone: string;
  from_address: string;
  to_name: string;
  to_phone: string;
  to_address: string;
  items_summary: string;
  amount_uzs: number;
  payment_status: string;
  courier_id: string | null;
  courier_name: string | null;
  courier_phone: string | null;
  courier_lat: number | null;
  courier_lng: number | null;
  created_at: string;
};

function supabase() {
  return getSupabase();
}

export function isBridgeOrder(id: string) {
  return id.startsWith(PREFIX);
}

function bridgeId(id: string) {
  return `${PREFIX}${id}`;
}

function rowId(orderId: string) {
  return orderId.slice(PREFIX.length);
}

const proof: OrderProof = {
  pickupPhoto: null,
  dropoffPhoto: null,
  signature: null,
  senderRating: null,
  courierRating: null,
};

const timing: JobTiming = {
  acceptedAt: null,
  arrivedAt: null,
  pickedUpAt: null,
  deliveredAt: null,
  cancelledAt: null,
  waitFee: 0,
  waitFreeLeftSec: 0,
  waitMaxed: false,
  cancelAllowed: false,
  cancelFee: 0,
  cancelTotal: 0,
  cancelLabel: "",
  arriveAllowed: false,
  releaseAllowed: true,
  releasePenalty: 0,
  releaseLabel: "",
  noShowAllowed: false,
};

function toCourierOrder(row: DeliveryRow): CourierOrder {
  const dropoff = row.to_address || row.to_name;
  return {
    ...proof,
    ...timing,
    id: bridgeId(row.id),
    pickup: row.from_address || row.from_name,
    dropoff,
    item: row.items_summary,
    deliveryFee: 0,
    courierPayout: 0,
    commission: 0,
    status: row.status,
    senderName: row.from_name,
    customerName: row.to_name,
    customerPhone: row.to_phone,
    note: `ProBazar ${row.probazar_order_id}`,
    distanceKm: null,
    courierKm: null,
    pickupLat: null,
    pickupLng: null,
    dropoffLat: row.courier_lat,
    dropoffLng: row.courier_lng,
    offeredToYou: false,
    pingUntil: null,
    acceptAllowed: row.status === "posted",
    acceptReason: null,
    commissionCharged: false,
    vehicle: "car",
    readyAt: Date.parse(row.created_at) || Date.now(),
    dropoffs: [{ label: dropoff, lat: row.courier_lat ?? 0, lng: row.courier_lng ?? 0 }],
    stopIndex: 0,
  };
}

async function listDeliveries(): Promise<DeliveryRow[]> {
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db.from("deliveries").select("*").order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as DeliveryRow[];
}

export async function mergeDeliveries(board: CourierBoard, courierId: string): Promise<CourierBoard> {
  const rows = await listDeliveries();
  if (!rows.length) return board;

  const known = new Set(
    [board.active, board.ping, ...board.nearby, ...board.completed].filter(Boolean).map((order) => order!.id),
  );
  const extraNearby: CourierOrder[] = [];
  const extraDone: CourierOrder[] = [];
  let active = board.active;

  for (const row of rows) {
    const order = toCourierOrder(row);
    if (known.has(order.id)) continue;
    const mine = row.courier_id === courierId;
    if ((row.status === "accepted" || row.status === "picked_up") && mine && !active) {
      active = order;
      continue;
    }
    if (row.status === "posted" || ((row.status === "accepted" || row.status === "picked_up") && mine)) {
      extraNearby.push(order);
      continue;
    }
    if (mine && (row.status === "delivered" || row.status === "cancelled")) extraDone.push(order);
  }

  return {
    ...board,
    active,
    nearby: [...extraNearby, ...board.nearby],
    completed: [...extraDone, ...board.completed],
  };
}

async function requireDb() {
  const db = supabase();
  if (!db) {
    throw new Error("Supabase ulanmagan. Express Go .env faylida EXPO_PUBLIC_SUPABASE_URL va EXPO_PUBLIC_SUPABASE_ANON_KEY bo‘lsin.");
  }
  return db;
}

export async function acceptBridgeDelivery(orderId: string, account: Account) {
  const db = await requireDb();
  const { data, error } = await db
    .from("deliveries")
    .update({
      status: "accepted",
      courier_id: account.id,
      courier_name: account.name,
      courier_phone: account.phone,
    })
    .eq("id", rowId(orderId))
    .eq("status", "posted")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Bu yukni boshqa kuryer oldi.");
}

export async function advanceBridgeDelivery(orderId: string, courierId: string, status: "picked_up" | "delivered") {
  const db = await requireDb();
  const { error } = await db.from("deliveries").update({ status }).eq("id", rowId(orderId)).eq("courier_id", courierId);
  if (error) throw new Error(error.message);
}

export async function releaseBridgeDelivery(orderId: string) {
  const db = await requireDb();
  const { error } = await db
    .from("deliveries")
    .update({ status: "posted", courier_id: null, courier_name: null, courier_phone: null })
    .eq("id", rowId(orderId));
  if (error) throw new Error(error.message);
}

export async function touchCourierLocation(courierId: string, lat: number, lng: number) {
  const db = supabase();
  if (!db) return;
  await db
    .from("deliveries")
    .update({ courier_lat: lat, courier_lng: lng })
    .eq("courier_id", courierId)
    .in("status", ["accepted", "picked_up"]);
}
