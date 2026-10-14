import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Actor } from "./actorContext";
import {
  createFileDeliveryRepository,
  type DeliveryOrder,
  type DeliveryRepository,
  type DeliveryUser,
} from "./deliveryRepo";
import { sendLoginCode } from "./sms";
import { kmBetween } from "../services/distance";
import { sendPushNotification } from "./expoPush";
import { setAccountNotify } from "./notifyBus";
import { attachSignedInUser, setPushToken } from "./store";
import { listingArea } from "./places";
import {
  asVehicle,
  docsNeeded,
  quoteCancel,
  quoteDelivery,
  quoteDeliveryFee,
  quoteRelease,
  vehicleFits,
  GPS_STALE_MS,
  matchRadiusKm,
  DOC_LABEL,
} from "./rules";
import type {
  Account,
  AdminBoard,
  CourierBoard,
  CourierDocKind,
  CourierDocs,
  CourierKassa,
  CourierOrder,
  DocStatus,
  JobTiming,
  LedgerEntry,
  LiveJob,
  OtpChallenge,
  Role,
  SenderOrder,
  VehicleKind,
} from "../types";

const OTP_MS = 5 * 60_000;
const OTP_TRIES = 5;
const SESSION_MS = 30 * 24 * 60 * 60_000;

let repository: DeliveryRepository | null = null;
let ready = false;
let reason = "DATABASE_URL yo'q. Yetkazib berish buyurtmalari PostgreSQL da saqlanmaydi.";

export function useDeliveryRepository(next: DeliveryRepository | null, postgres = false) {
  repository = next;
  ready = Boolean(postgres && next);
  if (!next) {
    reason = "DATABASE_URL yo'q. Yetkazib berish buyurtmalari PostgreSQL da saqlanmaydi.";
  }
}

export function deliveryDatabaseStatus(): { ready: boolean; reason: string } {
  return { ready, reason };
}

export function setDeliveryDatabaseReason(next: string) {
  reason = next;
  ready = false;
}

export function markDeliveryDatabaseReady() {
  ready = repository != null;
  if (ready) reason = "";
}

function repo(): DeliveryRepository {
  if (!repository) {
    throw new Error("Yetkazib berish bazasi ulanmagan. Buyurtma saqlanmadi.");
  }
  return repository;
}

function fail(message: string): never {
  throw new Error(message);
}

function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function newId(prefix: string): string {
  return `${prefix}${randomBytes(8).toString("hex")}`;
}

function adminPhones(): string[] {
  return (process.env.EG_ADMIN_PHONES ?? "")
    .split(/[,;\s]+/)
    .map((item: string) => item.replace(/\D/g, ""))
    .filter((item: string) => item.length >= 9);
}

function applyServerAdmin(user: DeliveryUser): boolean {
  const phone = digits(user.phone);
  const match = adminPhones().some((item) => phone === item || phone.endsWith(item.slice(-9)));
  if (!match || user.isAdmin) return false;
  user.isAdmin = true;
  return true;
}

function blankUser(input: { role: Role; name: string; phone: string; vehicle: VehicleKind | null }): DeliveryUser {
  const now = Date.now();
  return {
    id: newId("u"),
    phone: input.phone,
    role: input.role,
    isAdmin: false,
    name: input.name,
    balance: 0,
    vehicle: input.role === "courier" ? input.vehicle : null,
    shiftOn: false,
    shiftStartedAt: null,
    lat: null,
    lng: null,
    locationAt: null,
    phoneVerified: false,
    pushToken: null,
    passportUri: null,
    licenseUri: null,
    vehicleDocUri: null,
    passportStatus: "none",
    licenseStatus: "none",
    vehicleStatus: "none",
    passportNote: null,
    licenseNote: null,
    vehicleNote: null,
    ledger: [],
    createdAt: now,
    updatedAt: now,
  };
}

function docStatus(user: DeliveryUser, kind: CourierDocKind): DocStatus {
  if (kind === "license") return user.licenseStatus;
  if (kind === "vehicle") return user.vehicleStatus;
  return user.passportStatus;
}

function docUri(user: DeliveryUser, kind: CourierDocKind): string | null {
  if (kind === "license") return user.licenseUri;
  if (kind === "vehicle") return user.vehicleDocUri;
  return user.passportUri;
}

function docsOf(user: DeliveryUser): CourierDocs | null {
  if (user.role !== "courier" || !user.vehicle) return null;
  const needed = docsNeeded(user.vehicle);
  const status = {
    passport: user.passportStatus,
    license: user.licenseStatus,
    vehicle: user.vehicleStatus,
  };
  const notes = {
    passport: user.passportNote,
    license: user.licenseNote,
    vehicle: user.vehicleNote,
  };
  const missing = needed.filter((kind) => status[kind] !== "approved");
  return {
    passport: user.passportUri,
    license: user.licenseUri,
    vehicle: user.vehicleDocUri,
    needed,
    readyCount: needed.length - missing.length,
    needCount: needed.length,
    ready: missing.length === 0,
    pending: needed.filter((kind) => status[kind] === "pending").length,
    rejected: needed.filter((kind) => status[kind] === "rejected").length,
    missing: missing.length ? missing.map((kind) => DOC_LABEL[kind]).join(", ") : null,
    status,
    notes,
  };
}

function toAccount(user: DeliveryUser): Account {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    phone: user.phone,
    balance: user.role === "courier" ? user.balance : null,
    saved: { home: null, shop: null },
    vehicle: user.role === "courier" ? user.vehicle : null,
    shiftOn: user.role === "courier" && user.shiftOn,
    shiftStartedAt: user.role === "courier" ? user.shiftStartedAt : null,
    docs: docsOf(user),
    isAdmin: user.isAdmin,
  };
}

export function rememberActor(actor: Actor) {
  attachSignedInUser({
    id: actor.id,
    role: actor.role,
    name: actor.name,
    phone: actor.phone,
  });
}

export async function savePushToken(actor: Actor, token: string): Promise<void> {
  const next = token.trim();
  if (!next) return;
  const user = await repo().readUser(actor.id);
  if (!user) return;
  user.pushToken = next;
  user.updatedAt = Date.now();
  await repo().writeUser(user);
  attachSignedInUser({ id: user.id, role: user.role, name: user.name, phone: user.phone });
  setPushToken(user.id, next);
}

async function notifyAccount(
  userId: string | null | undefined,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
) {
  if (!userId) return;
  try {
    const user = await repo().readUser(userId);
    const token = user?.pushToken?.trim() ?? "";
    if (!token) return;
    await sendPushNotification(token, title, body, data);
  } catch (caught) {
    console.warn(caught instanceof Error ? caught.message : "Push yuborilmadi.");
  }
}

async function notifyOpenCouriers(order: DeliveryOrder) {
  if (order.pickupLat == null || order.pickupLng == null) return;
  const pickup = { lat: order.pickupLat, lng: order.pickupLng };
  const now = Date.now();
  for (const courier of await repo().listUsers()) {
    if (courier.role !== "courier" || !courier.shiftOn || !courier.vehicle || !docsApproved(courier)) continue;
    if (!vehicleFits(courier.vehicle, order.vehicle)) continue;
    if (courier.lat == null || courier.lng == null || courier.locationAt == null) continue;
    if (now - courier.locationAt > GPS_STALE_MS) continue;
    const km = kmBetween(pickup, { lat: courier.lat, lng: courier.lng });
    if (km > matchRadiusKm(courier.vehicle)) continue;
    await notifyAccount(courier.id, "Yangi Buyurtma!", `${order.pickup} → ${order.dropoff}`, { orderId: order.id });
  }
}

export async function actorFromToken(token: string): Promise<Actor | null> {
  if (!repository || !token) return null;
  const session = await repository.readSession(sha256(token));
  if (!session || session.expiresAt < Date.now()) return null;
  const user = await repository.readUser(session.userId);
  if (!user || !user.phoneVerified) return null;
  if (applyServerAdmin(user)) {
    user.updatedAt = Date.now();
    await repository.writeUser(user);
  }
  attachSignedInUser({ id: user.id, role: user.role, name: user.name, phone: user.phone });
  if (user.pushToken) setPushToken(user.id, user.pushToken);
  return { id: user.id, role: user.role, phone: user.phone, name: user.name, isAdmin: user.isAdmin };
}

function assertRole(role: string): Role {
  if (role !== "sender" && role !== "courier") fail("Rol noto'g'ri.");
  return role;
}

export async function registerAccount(input: {
  role: Role | string;
  name: string;
  phone: string;
  vehicle?: VehicleKind | null;
  deposit?: number;
}): Promise<Account> {
  const role = assertRole(input.role);
  const name = input.name.trim();
  const phone = digits(input.phone);
  if (name.length < 2) fail("Ismingizni yozing.");
  if (phone.length < 9) fail("Telefon raqamini to'liq yozing.");
  const store = repo();
  const existing = await store.readUserByPhone(phone, role);
  if (existing) fail("Bu telefon allaqachon ro'yxatdan o'tgan. Kirishni tanlang.");
  const user = blankUser({
    role,
    name,
    phone,
    vehicle: role === "courier" ? asVehicle(input.vehicle) : null,
  });
  applyServerAdmin(user);
  await store.writeUser(user);
  return toAccount(user);
}

async function issueOtp(role: Role, phone: string): Promise<OtpChallenge> {
  const store = repo();
  const user = await store.readUserByPhone(phone, role);
  if (!user) fail("Bu telefon bilan hisob topilmadi. Avval ro'yxatdan o'ting.");
  const code = String(randomInt(1000, 10000));
  const until = Date.now() + OTP_MS;
  await sendLoginCode(phone, code);
  await store.writeOtp({ phone, role, codeHash: sha256(code), expiresAt: until, tries: 0 });
  return { phone, until };
}

export async function requestLogin(input: { role: Role | string; phone: string }): Promise<OtpChallenge> {
  const role = assertRole(input.role);
  const phone = digits(input.phone);
  if (phone.length < 9) fail("Telefon raqamini to'liq yozing.");
  return issueOtp(role, phone);
}

export async function verifyLogin(input: {
  role: Role | string;
  phone: string;
  code: string;
}): Promise<{ account: Account; token: string }> {
  const role = assertRole(input.role);
  const phone = digits(input.phone);
  const typed = input.code.replace(/\D/g, "");
  const store = repo();
  const row = await store.readOtp(phone, role);
  if (!row) fail("Avval kodni yuboring.");
  if (Date.now() > row.expiresAt) fail("Kod muddati tugadi. Qayta yuboring.");
  if (row.tries >= OTP_TRIES) fail("Kod noto'g'ri. Qayta yuboring.");
  if (!sameHash(sha256(typed), row.codeHash)) {
    row.tries += 1;
    await store.writeOtp(row);
    fail("Kod noto'g'ri.");
  }
  const user = await store.readUserByPhone(phone, role);
  if (!user) fail("Bu telefon bilan hisob topilmadi. Avval ro'yxatdan o'ting.");
  user.phoneVerified = true;
  user.updatedAt = Date.now();
  applyServerAdmin(user);
  await store.writeUser(user);
  await store.deleteOtp(phone, role);
  const token = randomBytes(32).toString("hex");
  await store.writeSession({ tokenHash: sha256(token), userId: user.id, expiresAt: Date.now() + SESSION_MS });
  return { account: toAccount(user), token };
}

export async function accountOf(actor: Actor): Promise<Account> {
  const user = await repo().readUser(actor.id);
  if (!user) fail("Hisob topilmadi.");
  return toAccount(user);
}

function timing(order: DeliveryOrder): JobTiming {
  const cancel = quoteCancel({
    status: order.status,
    acceptedAt: order.acceptedAt,
    arrivedAt: order.arrivedAt,
    feeBase: order.deliveryFee,
    waitFee: 0,
  });
  const release = quoteRelease({
    status: order.status,
    acceptedAt: order.acceptedAt,
    arrivedAt: order.arrivedAt,
    waitMaxed: false,
  });
  return {
    acceptedAt: order.acceptedAt,
    arrivedAt: order.arrivedAt,
    pickedUpAt: order.pickedUpAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    waitFee: 0,
    waitFreeLeftSec: 0,
    waitMaxed: false,
    cancelAllowed: cancel.allowed,
    cancelFee: cancel.fee,
    cancelTotal: cancel.total,
    cancelLabel: cancel.label,
    arriveAllowed: order.status === "accepted" && order.arrivedAt == null,
    releaseAllowed: release.allowed,
    releasePenalty: release.penalty,
    releaseLabel: release.label,
    noShowAllowed: release.noShow,
  };
}

function proof() {
  return {
    pickupPhoto: null,
    dropoffPhoto: null,
    signature: null,
    senderRating: null,
    courierRating: null,
  };
}

function senderView(order: DeliveryOrder, courierName: string | null): SenderOrder {
  return {
    id: order.id,
    pickup: order.pickup,
    dropoff: order.dropoff,
    item: order.item,
    deliveryFee: order.deliveryFee,
    status: order.status,
    courierName,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    note: order.note,
    distanceKm: null,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    dropoffLat: order.dropoffLat,
    dropoffLng: order.dropoffLng,
    courierLat: null,
    courierLng: null,
    courierOnline: false,
    courierKm: null,
    etaMinutes: null,
    headingTo: order.status === "accepted" ? "pickup" : order.status === "picked_up" ? "dropoff" : null,
    vehicle: order.vehicle,
    readyAt: order.readyAt,
    dropoffs:
      order.dropoffLat != null && order.dropoffLng != null
        ? [{ label: order.dropoff, lat: order.dropoffLat, lng: order.dropoffLng }]
        : [],
    stopIndex: 0,
    ...proof(),
    ...timing(order),
  };
}

function courierView(order: DeliveryOrder, senderName: string, assigned: boolean): CourierOrder {
  const open = order.status === "posted" && !order.courierId;
  return {
    id: order.id,
    pickup: order.pickup,
    dropoff: order.dropoff,
    item: order.item,
    deliveryFee: order.deliveryFee,
    courierPayout: order.courierPayout,
    commission: order.commission,
    status: order.status,
    senderName,
    customerName: assigned ? order.customerName : "",
    customerPhone: assigned ? order.customerPhone : "",
    note: order.note,
    distanceKm: null,
    courierKm: null,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    dropoffLat: order.dropoffLat,
    dropoffLng: order.dropoffLng,
    offeredToYou: false,
    pingUntil: null,
    acceptAllowed: open,
    acceptReason: open ? null : "Bu buyurtma band.",
    commissionCharged: order.commissionCharged,
    vehicle: order.vehicle,
    readyAt: order.readyAt,
    dropoffs: [],
    stopIndex: 0,
    ...proof(),
    ...timing(order),
  };
}

function emptyBoard(active: CourierOrder | null, waiting: CourierOrder[], completed: CourierOrder[]): CourierBoard {
  return {
    active,
    ping: null,
    errandPing: null,
    nearby: [],
    waiting,
    waitingErrands: [],
    completed,
    errands: [],
    activeErrand: null,
    completedErrands: [],
    pins: [],
  };
}

async function nameOf(id: string | null): Promise<string | null> {
  if (!id) return null;
  const user = await repo().readUser(id);
  return user?.name ?? null;
}

function publicPlace(text: string): string {
  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const named = parts.filter((part) => !/^\d/.test(part) && !/\d{3,}/.test(part));
  return (named[named.length - 1] || parts[parts.length - 1] || "Manzil").slice(0, 48);
}

export async function liveJobs(): Promise<LiveJob[]> {
  const orders = await repo().listOrders();
  return orders
    .filter((order) => order.status === "posted" || order.status === "accepted" || order.status === "picked_up")
    .slice(0, 20)
    .map((order) => {
      const area = listingArea(order.pickup, order.pickupLat, order.pickupLng);
      return {
        id: order.id,
        pickup: publicPlace(order.pickup),
        dropoff: publicPlace(order.dropoff),
        item: order.item,
        vehicle: order.vehicle,
        deliveryFee: order.deliveryFee,
        status: order.status,
        at: order.readyAt,
        region: area.region,
        district: area.district,
      };
    });
}

function point(lat?: number | null, lng?: number | null): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function createDeliveryOrder(
  actor: Actor,
  input: {
    senderId?: string;
    pickup: string;
    dropoff: string;
    item: string;
    deliveryFee?: number;
    customerName?: string;
    customerPhone: string;
    note?: string;
    pickupLat?: number | null;
    pickupLng?: number | null;
    dropoffLat?: number | null;
    dropoffLng?: number | null;
    district?: string | null;
    vehicle?: VehicleKind | null;
    readyAt?: number | null;
  },
): Promise<SenderOrder> {
  if (actor.role !== "sender") fail("E'lonni faqat buyurtmachi qo'yadi.");
  const pickup = input.pickup.trim();
  const dropoff = input.dropoff.trim();
  const item = input.item.trim();
  const customerPhone = digits(input.customerPhone);
  if (pickup.length < 2 || dropoff.length < 2 || !item) fail("Olib ketish va nima olib borilishini yozing.");
  if (customerPhone.length < 9) fail("Mijoz telefonini to'liq yozing.");
  const vehicle = asVehicle(input.vehicle);
  const quoted = quoteDeliveryFee({ distanceKm: 0, district: input.district, vehicle });
  const offered = Math.round(input.deliveryFee ?? 0);
  const deliveryFee = Number.isFinite(offered) && offered >= quoted.fee ? offered : quoted.fee;
  const money = quoteDelivery(deliveryFee);
  const now = Date.now();
  const from = point(input.pickupLat, input.pickupLng);
  const to = point(input.dropoffLat, input.dropoffLng);
  const order: DeliveryOrder = {
    id: `PX-${randomBytes(6).toString("hex")}`,
    senderId: actor.id,
    courierId: null,
    pickup,
    dropoff,
    item,
    customerName: (input.customerName ?? "").trim(),
    customerPhone,
    note: (input.note ?? "").trim(),
    deliveryFee,
    commission: money.commission,
    courierPayout: money.courierPayout,
    status: "posted",
    vehicle,
    readyAt: input.readyAt && input.readyAt > now ? input.readyAt : now,
    postedAt: now,
    acceptedAt: null,
    arrivedAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    cancelledAt: null,
    commissionCharged: false,
    declinedBy: [],
    pickupLat: from?.lat ?? null,
    pickupLng: from?.lng ?? null,
    dropoffLat: to?.lat ?? null,
    dropoffLng: to?.lng ?? null,
    version: 1,
    updatedAt: now,
  };
  await repo().insertOrder(order);
  const saved = await repo().readOrder(order.id);
  if (!saved) fail("Buyurtma saqlanmadi.");
  await notifyOpenCouriers(saved);
  return senderView(saved, null);
}

export async function updateDelivery(
  actor: Actor,
  orderId: string,
  input: {
    pickup: string;
    dropoff: string;
    item: string;
    deliveryFee?: number;
    customerName?: string;
    customerPhone: string;
    note?: string;
    vehicle?: VehicleKind | null;
  },
): Promise<SenderOrder> {
  if (actor.role !== "sender") fail("E'lonni faqat buyurtmachi qo'yadi.");
  const store = repo();
  return store.transaction(async () => {
    const order = await store.readOrder(orderId);
    if (!order || order.senderId !== actor.id) fail("E'lon topilmadi.");
    if (order.status !== "posted") fail("Bu buyurtma allaqachon olingan.");
    const pickup = input.pickup.trim();
    const dropoff = input.dropoff.trim();
    const item = input.item.trim();
    const customerPhone = digits(input.customerPhone);
    if (pickup.length < 2 || dropoff.length < 2 || !item) fail("Olib ketish va nima olib borilishini yozing.");
    if (customerPhone.length < 9) fail("Mijoz telefonini to'liq yozing.");
    const vehicle = asVehicle(input.vehicle ?? order.vehicle);
    const quoted = quoteDeliveryFee({ distanceKm: 0, vehicle });
    const offered = Math.round(input.deliveryFee ?? 0);
    const deliveryFee = Number.isFinite(offered) && offered >= quoted.fee ? offered : quoted.fee;
    const money = quoteDelivery(deliveryFee);
    const now = Date.now();
    const next: DeliveryOrder = {
      ...order,
      pickup,
      dropoff,
      item,
      customerName: (input.customerName ?? "").trim(),
      customerPhone,
      note: (input.note ?? "").trim(),
      vehicle,
      deliveryFee,
      commission: money.commission,
      courierPayout: money.courierPayout,
      version: order.version + 1,
      updatedAt: now,
    };
    const saved = await store.saveOrderIf("posted", next);
    if (!saved) fail("Holat o'zgarmadi.");
    return senderView(saved, null);
  });
}

export async function listMine(actor: Actor): Promise<SenderOrder[]> {
  if (actor.role !== "sender") fail("Bu bo'lim buyurtmachi uchun.");
  const orders = (await repo().listOrders()).filter((order) => order.senderId === actor.id);
  const views: SenderOrder[] = [];
  for (const order of orders) {
    views.push(senderView(order, await nameOf(order.courierId)));
  }
  return views;
}

export async function cancelDelivery(actor: Actor, orderId: string): Promise<SenderOrder> {
  if (actor.role !== "sender") fail("Bekor qilish faqat buyurtmachi uchun.");
  const store = repo();
  const saved = await store.transaction(async () => {
    const order = await store.readOrder(orderId);
    if (!order || order.senderId !== actor.id) fail("E'lon topilmadi.");
    const cancel = quoteCancel({
      status: order.status,
      acceptedAt: order.acceptedAt,
      arrivedAt: order.arrivedAt,
      feeBase: order.deliveryFee,
      waitFee: 0,
    });
    if (!cancel.allowed) fail(cancel.label);
    const now = Date.now();
    const next: DeliveryOrder = {
      ...order,
      status: "cancelled",
      cancelledAt: now,
      version: order.version + 1,
      updatedAt: now,
    };
    const row = await store.saveOrderIf(order.status, next);
    if (!row) fail("Holat o'zgarmadi.");
    return row;
  });
  if (saved.courierId) {
    await notifyAccount(saved.courierId, "Buyurtma bekor", `${saved.item} buyurtmachi tomonidan bekor qilindi.`);
  }
  return senderView(saved, await nameOf(saved.courierId));
}

async function requireCourier(actor: Actor): Promise<DeliveryUser> {
  if (actor.role !== "courier") fail("Bu bo'lim kuryer uchun.");
  const user = await repo().readUser(actor.id);
  if (!user || user.role !== "courier") fail("Bu bo'lim kuryer uchun.");
  return user;
}

function docsApproved(user: DeliveryUser): boolean {
  if (!user.vehicle) return false;
  return docsNeeded(user.vehicle).every((kind) => docStatus(user, kind) === "approved");
}

export async function courierBoard(actor: Actor): Promise<CourierBoard> {
  const courier = await requireCourier(actor);
  const orders = await repo().listOrders();
  const mine = orders.filter((order) => order.courierId === courier.id);
  const activeRow = mine.find((order) => order.status === "accepted" || order.status === "picked_up") ?? null;
  const waiting = orders.filter(
    (order) => order.status === "posted" && !order.courierId && !order.declinedBy.includes(courier.id),
  );
  const completed = mine.filter((order) => order.status === "delivered" || order.status === "cancelled");
  const senderName = async (order: DeliveryOrder) => (await nameOf(order.senderId)) ?? "Buyurtmachi";
  return emptyBoard(
    activeRow ? courierView(activeRow, await senderName(activeRow), true) : null,
    await Promise.all(waiting.map(async (order) => courierView(order, await senderName(order), false))),
    await Promise.all(completed.map(async (order) => courierView(order, await senderName(order), true))),
  );
}

export async function acceptDelivery(actor: Actor, orderId: string): Promise<CourierBoard> {
  const courier = await requireCourier(actor);
  if (!courier.shiftOn) fail("Avval smenani oching.");
  if (!docsApproved(courier)) fail("Avval hujjatlar tasdiqlansin.");
  const store = repo();
  const existing = (await store.listOrders()).find(
    (order) => order.courierId === courier.id && (order.status === "accepted" || order.status === "picked_up"),
  );
  if (existing) fail("Avval joriy buyurtmani yakunlang.");
  const order = await store.readOrder(orderId);
  if (!order) fail("Buyurtma topilmadi.");
  if (order.declinedBy.includes(courier.id)) fail("Bu buyurtmani rad etgansiz.");
  if (!vehicleFits(courier.vehicle ?? "moto", order.vehicle)) fail("Bu transport sizga mos emas.");
  if (courier.balance < order.commission) fail("Depozit yetarli emas.");
  const claimed = await store.claimPosted(orderId, courier.id, Date.now());
  if (!claimed) fail("Bu buyurtma band.");
  await notifyAccount(claimed.senderId, "Kuryer qabul qildi", `${courier.name} «${claimed.item}» ni oldi.`);
  return courierBoard(actor);
}

export async function declineDelivery(actor: Actor, orderId: string): Promise<CourierBoard> {
  const courier = await requireCourier(actor);
  const store = repo();
  await store.transaction(async () => {
    const order = await store.readOrder(orderId);
    if (!order || order.status !== "posted" || order.courierId) fail("Bu buyurtma band.");
    if (!order.declinedBy.includes(courier.id)) order.declinedBy.push(courier.id);
    order.version += 1;
    order.updatedAt = Date.now();
    const saved = await store.saveOrderIf("posted", order);
    if (!saved) fail("Bu buyurtma band.");
  });
  return courierBoard(actor);
}

export async function pickupDelivery(actor: Actor, orderId: string): Promise<CourierBoard> {
  const courier = await requireCourier(actor);
  const store = repo();
  await store.transaction(async () => {
    const order = await store.readOrder(orderId);
    if (!order || order.courierId !== courier.id) fail("Buyurtma topilmadi.");
    if (order.status !== "accepted") fail("Avval buyurtmani qabul qiling.");
    const now = Date.now();
    const next: DeliveryOrder = {
      ...order,
      status: "picked_up",
      pickedUpAt: now,
      arrivedAt: order.arrivedAt ?? now,
      version: order.version + 1,
      updatedAt: now,
    };
    const saved = await store.saveOrderIf("accepted", next);
    if (!saved) fail("Holat o'zgarmadi.");
    await notifyAccount(saved.senderId, "Mahsulot olindi", `${saved.item} yo'lda.`);
  });
  return courierBoard(actor);
}

export async function deliverDelivery(actor: Actor, orderId: string): Promise<CourierBoard> {
  const store = repo();
  await store.transaction(async () => {
    const courier = await requireCourier(actor);
    const order = await store.readOrder(orderId);
    if (!order || order.courierId !== courier.id) fail("Buyurtma topilmadi.");
    if (order.status !== "picked_up") fail("Avval buyurtmani oling.");
    if (order.commissionCharged) fail("Foiz allaqachon yechilgan.");
    if (courier.balance < order.commission) fail("Depozit yetarli emas.");
    const now = Date.now();
    const next: DeliveryOrder = {
      ...order,
      status: "delivered",
      deliveredAt: now,
      commissionCharged: true,
      version: order.version + 1,
      updatedAt: now,
    };
    const saved = await store.saveOrderIf("picked_up", next);
    if (!saved) fail("Holat o'zgarmadi.");
    courier.balance -= order.commission;
    courier.updatedAt = now;
    courier.ledger.unshift({
      id: newId("l"),
      userId: courier.id,
      kind: "commission",
      amount: -order.commission,
      label: "Vositachilik haqi",
      jobId: order.id,
      at: now,
      balance: courier.balance,
    });
    await store.writeUser(courier);
    await notifyAccount(saved.senderId, "Yetkazib berildi", `${saved.item} manzilga yetdi.`);
  });
  return courierBoard(actor);
}

export async function releaseDelivery(actor: Actor, orderId: string): Promise<CourierBoard> {
  const courier = await requireCourier(actor);
  const store = repo();
  await store.transaction(async () => {
    const order = await store.readOrder(orderId);
    if (!order || order.courierId !== courier.id) fail("Buyurtma topilmadi.");
    const release = quoteRelease({
      status: order.status,
      acceptedAt: order.acceptedAt,
      arrivedAt: order.arrivedAt,
      waitMaxed: false,
    });
    if (!release.allowed) fail(release.label);
    const now = Date.now();
    const next: DeliveryOrder = {
      ...order,
      status: "posted",
      courierId: null,
      acceptedAt: null,
      arrivedAt: null,
      version: order.version + 1,
      updatedAt: now,
    };
    const saved = await store.saveOrderIf("accepted", next);
    if (!saved) fail("Holat o'zgarmadi.");
    await notifyAccount(order.senderId, "Kuryer qaytardi", `${order.item} qayta e'longa chiqdi.`);
  });
  return courierBoard(actor);
}

export async function arriveDelivery(actor: Actor, orderId: string): Promise<CourierBoard> {
  const courier = await requireCourier(actor);
  const store = repo();
  await store.transaction(async () => {
    const order = await store.readOrder(orderId);
    if (!order || order.courierId !== courier.id) fail("Buyurtma topilmadi.");
    if (order.status !== "accepted") fail("Avval buyurtmani qabul qiling.");
    if (order.arrivedAt != null) return;
    const now = Date.now();
    const next: DeliveryOrder = { ...order, arrivedAt: now, version: order.version + 1, updatedAt: now };
    const saved = await store.saveOrderIf("accepted", next);
    if (!saved) fail("Holat o'zgarmadi.");
    await notifyAccount(saved.senderId, "Kuryer yetib keldi", `${saved.item} olish joyida kutmoqda.`);
  });
  return courierBoard(actor);
}

export async function pingCourier(actor: Actor, lat: number, lng: number): Promise<CourierBoard> {
  const courier = await requireCourier(actor);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) fail("Joylashuv noto'g'ri.");
  courier.lat = lat;
  courier.lng = lng;
  courier.locationAt = Date.now();
  courier.updatedAt = courier.locationAt;
  await repo().writeUser(courier);
  return courierBoard(actor);
}

export async function setCourierShift(actor: Actor, on: boolean): Promise<Account> {
  const courier = await requireCourier(actor);
  if (on) {
    if (!docsApproved(courier)) fail("Avval hujjatlar tasdiqlansin.");
    courier.shiftOn = true;
    if (courier.shiftStartedAt == null) courier.shiftStartedAt = Date.now();
  } else {
    const busy = (await repo().listOrders()).some(
      (order) => order.courierId === courier.id && (order.status === "accepted" || order.status === "picked_up"),
    );
    if (busy) fail("Avval joriy buyurtmani yakunlang.");
    courier.shiftOn = false;
  }
  courier.updatedAt = Date.now();
  await repo().writeUser(courier);
  return toAccount(courier);
}

export async function submitDoc(actor: Actor, kind: CourierDocKind, uri: string): Promise<Account> {
  const courier = await requireCourier(actor);
  const next = uri.trim();
  if (!next) fail("Hujjat rasmini yuklang.");
  if (kind === "license") {
    courier.licenseUri = next;
    courier.licenseStatus = "pending";
    courier.licenseNote = null;
  } else if (kind === "vehicle") {
    courier.vehicleDocUri = next;
    courier.vehicleStatus = "pending";
    courier.vehicleNote = null;
  } else if (kind === "passport") {
    courier.passportUri = next;
    courier.passportStatus = "pending";
    courier.passportNote = null;
  } else {
    fail("Hujjat turi noto'g'ri.");
  }
  courier.updatedAt = Date.now();
  await repo().writeUser(courier);
  return toAccount(courier);
}

function requireAdmin(actor: Actor) {
  if (!actor.isAdmin) fail("Bu amal faqat administrator uchun.");
}

export async function creditAsAdmin(actor: Actor, courierId: string, amount: number): Promise<Account> {
  requireAdmin(actor);
  const next = Math.round(amount);
  if (!Number.isFinite(next) || next <= 0) fail("Summa noto'g'ri.");
  const store = repo();
  const courier = await store.readUser(courierId);
  if (!courier || courier.role !== "courier") fail("Kuryer topilmadi.");
  const now = Date.now();
  courier.balance += next;
  courier.updatedAt = now;
  courier.ledger.unshift({
    id: newId("l"),
    userId: courier.id,
    kind: "topup",
    amount: next,
    label: "Administrator kiritdi",
    jobId: null,
    at: now,
    balance: courier.balance,
  });
  await store.writeUser(courier);
  return toAccount(courier);
}

export async function reviewDoc(
  actor: Actor,
  courierId: string,
  kind: CourierDocKind,
  ok: boolean,
  note?: string | null,
): Promise<Account> {
  requireAdmin(actor);
  const courier = await repo().readUser(courierId);
  if (!courier || courier.role !== "courier") fail("Kuryer topilmadi.");
  if (docStatus(courier, kind) !== "pending" || !docUri(courier, kind)) {
    fail("Tasdiqlash uchun avval hujjat yuklangan bo'lishi kerak.");
  }
  const status: DocStatus = ok ? "approved" : "rejected";
  const why = ok ? null : (note ?? "").trim() || "Hujjat rad etildi.";
  if (kind === "license") {
    courier.licenseStatus = status;
    courier.licenseNote = why;
  } else if (kind === "vehicle") {
    courier.vehicleStatus = status;
    courier.vehicleNote = why;
  } else if (kind === "passport") {
    courier.passportStatus = status;
    courier.passportNote = why;
  } else {
    fail("Hujjat turi noto'g'ri.");
  }
  courier.updatedAt = Date.now();
  await repo().writeUser(courier);
  return toAccount(courier);
}

export async function kassaOf(actor: Actor): Promise<CourierKassa> {
  const courier = await requireCourier(actor);
  const entries = courier.ledger;
  const sum = (kind: LedgerEntry["kind"]) =>
    entries.filter((entry) => entry.kind === kind).reduce((total, entry) => total + Math.abs(entry.amount), 0);
  return {
    balance: courier.balance,
    cashedTotal: sum("cashout"),
    commissionTotal: sum("commission"),
    penaltyTotal: sum("penalty"),
    topupTotal: sum("topup"),
    cashoutAllowed: false,
    cashoutReason: "Chiqarish hali ulanmagan.",
    entries,
  };
}

export async function adminBoard(actor: Actor): Promise<AdminBoard> {
  requireAdmin(actor);
  const store = repo();
  const users = await store.listUsers();
  const orders = await store.listOrders();
  const people = users.map((user) => ({
    id: user.id,
    role: user.role,
    name: user.name,
    phone: user.phone,
    balance: user.role === "courier" ? user.balance : null,
    online: user.role === "courier" && user.shiftOn,
    lat: user.lat,
    lng: user.lng,
    vehicle: user.vehicle,
    shiftOn: user.shiftOn,
    docsReady: user.role === "courier" && docsApproved(user),
    docsPending: user.role === "courier" ? docsOf(user)?.pending ?? 0 : 0,
    docsRejected: user.role === "courier" ? docsOf(user)?.rejected ?? 0 : 0,
  }));
  const jobs = orders.map((order) => ({
    id: order.id,
    kind: "order" as const,
    item: order.item,
    status: order.status,
    pickup: order.pickup,
    dropoff: order.dropoff,
    place: order.dropoff,
    who: users.find((user) => user.id === order.senderId)?.name ?? "Buyurtmachi",
    fee: order.deliveryFee,
    distanceKm: null,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    dropoffLat: order.dropoffLat,
    dropoffLng: order.dropoffLng,
    pingCourierName: null,
    commissionCharged: order.commissionCharged,
    hasPickupPhoto: false,
    hasDropoffPhoto: false,
    hasSignature: false,
    senderRating: null,
    courierRating: null,
    vehicle: order.vehicle,
    waitFee: 0,
    cancelFee: 0,
    releasePenalty: 0,
    arrived: order.arrivedAt != null,
    readyAt: order.readyAt,
  }));
  return {
    platformRevenue: orders.filter((order) => order.commissionCharged).reduce((sum, order) => sum + order.commission, 0),
    adRevenue: 0,
    turnover: orders.reduce((sum, order) => sum + order.deliveryFee, 0),
    delivered: orders.filter((order) => order.status === "delivered").length,
    active: orders.filter((order) => order.status === "posted" || order.status === "accepted" || order.status === "picked_up").length,
    senders: users.filter((user) => user.role === "sender").length,
    couriers: users.filter((user) => user.role === "courier").length,
    jobs,
    people,
    pins: [],
    ads: [],
    cashoutTotal: 0,
    payouts: [],
    reviews: [],
    sms: [],
    pushes: [],
  };
}

setAccountNotify((userId, title, body) => {
  void notifyAccount(userId, title, body);
});

