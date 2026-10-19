import { kmBetween, type MapPoint } from "../services/distance";
import { sendLoginCode, smsTestMode, SMS_TEST_CODE } from "./sms";
import { sameHash, sha256 } from "./sha256";
import { listingArea } from "./places";
import { roadRoute, roadTrip, routeTargetKey } from "../services/route";
import { formatMoney } from "../services/money";
import { t, tx } from "../i18n";
import { accountNotify } from "./notifyBus";
import { notifyFoodOrder, persistFoodCart, persistFoodOrder, persistFoodUser } from "./foodPersist";
import { kitchenByPhone } from "./kitchens";
import { actorStore } from "./actorContext";
import type {
  Account,
  AdCard,
  AdPlan,
  AdSlot,
  AdminBoard,
  AdminDocReview,
  BuilderCard,
  FoodDesk,
  FoodOwnerCard,
  FoodTicket,
  FoodTicketStatus,
  GuestPass,
  KitchenDesk,
  ChatMessage,
  ChatThread,
  OtpChallenge,
  PushOutbox,
  SmsKind,
  SmsOutbox,
  CourierKassa,
  InboxBundle,
  InboxNote,
  JobKind,
  LedgerEntry,
  LedgerKind,
  LiveJob,
  CourierDocKind,
  CourierDocs,
  DocStatus,
  SavedAddresses,
  SavedPlace,
  SavedSlot,
  CourierBoard,
  CourierOrder,
  ErrandCard,
  ErrandJob,
  ErrandMine,
  ErrandOffer,
  FeeQuote,
  JobTiming,
  MapPin,
  OrderProof,
  OrderStatus,
  Pricing,
  Role,
  RouteStop,
  SenderOrder,
  MasterPass,
  TripCard,
  TripPass,
  TripQuery,
  TripReveal,
  VehicleKind,
} from "../types";
import {
  ARRIVE_RADIUS_KM,
  COMMISSION_PERCENT,
  DOC_LABEL,
  GPS_STALE_MS,
  matchRadiusKm,
  MAX_DROPOFFS,
  MAX_PINGS,
  PING_MS,
  VEHICLE_LABEL,
  etaMinutes,
  guessDistrict,
  asReadyAt,
  isJobOpen,
  asAdPlan,
  asAdSlot,
  asVehicle,
  docsNeeded,
  dropoffLine,
  lastDropoff,
  LEDGER_LABEL,
  MIN_CASHOUT_SOM,
  TRIP_NEAR_KM,
  TRIP_PASS_DAYS,
  TRIP_PASS_PRICE,
  FOOD_SUB_DAYS,
  FOOD_SUB_PRICE,
  MASTER_SUB_DAYS,
  MASTER_SUB_PRICE,
  quoteCashout,
  quoteAd,
  quoteCancel,
  quoteDelivery,
  quoteDeliveryFee,
  quoteErrand,
  quoteRelease,
  waitClock,
  vehicleFits,
} from "./rules";

type UserRecord = {
  id: string;
  role: Role;
  name: string;
  phone: string;
  balance: number;
  home: SavedPlace | null;
  shop: SavedPlace | null;
  lat: number | null;
  lng: number | null;
  locationAt: number | null;
  routeKm: number | null;
  routeMinutes: number | null;
  routeTargetKey: string | null;
  routeStamp: string | null;
  routeAt: number | null;
  vehicle: VehicleKind;
  shiftOn: boolean;
  shiftStartedAt: number | null;
  passportUri: string | null;
  licenseUri: string | null;
  vehicleDocUri: string | null;
  passportStatus: DocStatus;
  licenseStatus: DocStatus;
  vehicleStatus: DocStatus;
  passportNote: string | null;
  licenseNote: string | null;
  vehicleNote: string | null;
  phoneVerified: boolean;
  pushToken?: string | null;
  updatedAt?: number;
};

type OrderRecord = {
  id: string;
  senderId: string;
  courierId: string | null;
  pickup: string;
  dropoff: string;
  item: string;
  customerName: string;
  customerPhone: string;
  note: string;
  distanceKm: number | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  dropoffs: RouteStop[];
  stopIndex: number;
  deliveryFee: number;
  commission: number;
  courierPayout: number;
  status: OrderStatus;
  commissionCharged: boolean;
  pingCourierId: string | null;
  pingUntil: number | null;
  declinedBy: string[];
  vehicle: VehicleKind;
  readyAt: number;
  acceptedAt: number | null;
  arrivedAt: number | null;
  pickedUpAt: number | null;
  deliveredAt: number | null;
  cancelledAt: number | null;
  waitFee: number;
  cancelFee: number;
  releasePenalty: number;
  pickupPhoto: string | null;
  dropoffPhoto: string | null;
  signature: string | null;
  senderRating: number | null;
  courierRating: number | null;
  updatedAt?: number;
};

type ErrandRecord = {
  id: string;
  district: string;
  pickup: string;
  item: string;
  productPrice: number;
  courierFee: number;
  commission: number;
  collectFromCustomer: number;
  dropoff: string;
  customerPhone: string;
  courierId: string | null;
  status: OrderStatus;
  commissionCharged: boolean;
  distanceKm: number | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  pingCourierId: string | null;
  pingUntil: number | null;
  declinedBy: string[];
  vehicle: VehicleKind;
  readyAt: number;
  acceptedAt: number | null;
  arrivedAt: number | null;
  waitFee: number;
  cancelFee: number;
  releasePenalty: number;
  pickupPhoto: string | null;
  dropoffPhoto: string | null;
  signature: string | null;
  senderRating: number | null;
  courierRating: number | null;
};

const users: UserRecord[] = [];
const orders: OrderRecord[] = [];
const errands: ErrandRecord[] = [];
let guestSaved: SavedAddresses = { home: null, shop: null };
const notes: InboxNote[] = [];
const chats: ChatMessage[] = [];
const ledger: LedgerEntry[] = [];
const smsOutbox: SmsOutbox[] = [];
const pushOutbox: PushOutbox[] = [];
const otps: OtpRecord[] = [];
const trips: TripRecord[] = [];

export type StoredTrip = {
  id: string;
  phone: string;
  offer?: "rider" | "driver";
  passengerName: string;
  from: string;
  to: string;
  fromLat: number | null;
  fromLng: number | null;
  toLat: number | null;
  toLng: number | null;
  whenLabel: string;
  seats: number;
  price: number;
  note: string;
  vehicle?: string;
  photo?: string | null;
  at: number;
};

export type TripRepository = {
  list(): Promise<StoredTrip[]>;
  upsert(row: StoredTrip): Promise<void>;
  remove(id: string): Promise<void>;
};

let tripRepo: TripRepository | null = null;

function storedTrip(trip: TripRecord): StoredTrip {
  return {
    id: trip.id,
    phone: trip.phone,
    offer: trip.offer === "driver" ? "driver" : "rider",
    passengerName: trip.passengerName,
    from: trip.from,
    to: trip.to,
    fromLat: trip.fromLat,
    fromLng: trip.fromLng,
    toLat: trip.toLat,
    toLng: trip.toLng,
    whenLabel: trip.whenLabel,
    seats: trip.seats,
    price: trip.price,
    note: trip.note,
    vehicle: trip.vehicle,
    photo: trip.photo,
    at: trip.at,
  };
}

function applyStoredTrips(rows: StoredTrip[]) {
  trips.length = 0;
  let max = tripSeq;
  for (const row of rows) {
    const photo = typeof row.photo === "string" && row.photo.startsWith("data:image/") ? row.photo : null;
    trips.push({
      ...row,
      offer: row.offer === "driver" ? "driver" : "rider",
      vehicle: typeof row.vehicle === "string" ? row.vehicle : "",
      photo,
    });
    const seq = Number(String(row.id).replace(/^t/, ""));
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  tripSeq = max;
  trips.sort((a, b) => b.at - a.at);
}

async function pullTrips() {
  if (!tripRepo) return;
  applyStoredTrips(await tripRepo.list());
}

export async function useTripRepository(repo: TripRepository): Promise<{ count: number; seeded: boolean }> {
  const remote = await repo.list();
  if (remote.length === 0 && trips.length > 0) {
    for (const trip of trips) await repo.upsert(storedTrip(trip));
    tripRepo = repo;
    return { count: trips.length, seeded: true };
  }
  applyStoredTrips(remote);
  tripRepo = repo;
  return { count: trips.length, seeded: false };
}

export type StoredConstructionJob = {
  id: string;
  name: string;
  phone: string;
  trade: string;
  region: string;
  area: string;
  address: string;
  text: string;
  photo: string | null;
  photos: string[];
  price: number | null;
  payKind: "" | "deal" | "fixed";
  term: "" | "day" | "temp" | "steady";
  workers: number;
  status: "active" | "filled";
  at: number;
};

export type ConstructionRepository = {
  listJobs(): Promise<StoredConstructionJob[]>;
  upsertJob(row: StoredConstructionJob): Promise<void>;
  removeJob(id: string): Promise<void>;
  subscriptionUntil(phone: string): Promise<number | null>;
};

let constructionRepo: ConstructionRepository | null = null;

type MasterSubRecord = { phone: string; until: number };
const masterSubs: MasterSubRecord[] = [];

function jobStatus(row: BuilderRecord): "active" | "filled" {
  return row.status === "filled" ? "filled" : "active";
}

function isJobUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function freshJobId(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") return cryptoRef.randomUUID();
  builderSeq += 1;
  return `b${builderSeq}`;
}

function storedJob(row: BuilderRecord): StoredConstructionJob {
  const pay = row.payKind === "deal" || row.payKind === "fixed" ? row.payKind : "";
  const term = row.term === "day" || row.term === "temp" || row.term === "steady" ? row.term : "";
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    trade: row.trade,
    region: row.region ?? "",
    area: row.area ?? "",
    address: row.address,
    text: row.text,
    photo: row.photo,
    photos: row.photos ?? (row.photo ? [row.photo] : []),
    price: row.price ?? null,
    payKind: pay,
    term,
    workers: row.workers ?? 0,
    status: jobStatus(row),
    at: row.at,
  };
}

function jobFromStored(row: StoredConstructionJob): BuilderRecord {
  return {
    id: row.id,
    kind: "job",
    name: row.name,
    phone: row.phone,
    trade: row.trade,
    address: row.address,
    text: row.text,
    photo: row.photo,
    photos: row.photos,
    ratings: [],
    at: row.at,
    region: row.region,
    area: row.area,
    price: row.price,
    payKind: row.payKind,
    term: row.term,
    workers: row.workers,
    status: row.status,
  };
}

async function saveConstructionJob(row: BuilderRecord): Promise<void> {
  if (!constructionRepo || row.kind !== "job") return;
  if (!isJobUuid(row.id)) row.id = freshJobId();
  await constructionRepo.upsertJob(storedJob(row));
}

export async function useConstructionRepository(repo: ConstructionRepository): Promise<{ count: number; seeded: boolean }> {
  const remote = await repo.listJobs();
  const localJobs = builders.filter((row) => row.kind === "job");
  const offers = builders.filter((row) => row.kind !== "job");
  if (remote.length === 0 && localJobs.length > 0) {
    constructionRepo = repo;
    for (const job of localJobs) await saveConstructionJob(job);
    return { count: localJobs.length, seeded: true };
  }
  builders.length = 0;
  for (const row of remote) builders.push(jobFromStored(row));
  for (const offer of offers) builders.push(offer);
  constructionRepo = repo;
  return { count: remote.length, seeded: false };
}
const builders: BuilderRecord[] = [];
const foodTickets: FoodTicketRecord[] = [];
const kitchenLinks: { phone: string; chatId: number }[] = [];
const foodOpen: { placeId: string; accepting: boolean }[] = [];

type FoodOwner = {
  id: string;
  placeId: string;
  name: string;
  phone: string;
  until: number;
};

const foodOwners: FoodOwner[] = [];

type FoodTicketRecord = {
  id: string;
  placeId: string;
  placeName: string;
  pickup: string;
  staffPhone: string;
  customerName: string;
  customerPhone: string;
  dropoff: string;
  handoff?: "pickup" | "courier";
  lines: { name: string; qty: number; price: number }[];
  foodTotal: number;
  status: FoodTicketStatus;
  orderId: string | null;
  at: number;
};

type BuilderRating = { phone: string; stars: number };

type BuilderPay = "" | "deal" | "fixed";
type BuilderTerm = "" | "day" | "temp" | "steady";

type BuilderRecord = {
  id: string;
  kind: "offer" | "job";
  name: string;
  phone: string;
  trade: string;
  address: string;
  text: string;
  photo: string | null;
  photos?: string[];
  ratings: BuilderRating[];
  at: number;
  region?: string;
  area?: string;
  experience?: string;
  price?: number | null;
  payKind?: BuilderPay;
  term?: BuilderTerm;
  workers?: number;
  status?: "active" | "filled";
};

type CustomLocation = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  searchCount: number;
  updatedAt: number;
};

/** Maxsus joylar: xarita va noma'lum qidiruvlar shu yerga yig'iladi. */
const customLocations: CustomLocation[] = [];
const CUSTOM_MOVE_KM = 0.2;
const CUSTOM_LIMIT = 500;
const tripPasses: TripPassRecord[] = [];
let userSeq = 1;
let orderSeq = 1040;
let errandSeq = 200;
let adSeq = 3;
let noteSeq = 1;
let chatSeq = 1;
let ledgerSeq = 1;
let smsSeq = 1;
let pushSeq = 1;
let tripSeq = 1;
let builderSeq = 1;
let foodSeq = 1;

type TripRecord = {
  id: string;
  offer: "rider" | "driver";
  passengerName: string;
  phone: string;
  from: string;
  to: string;
  fromLat: number | null;
  fromLng: number | null;
  toLat: number | null;
  toLng: number | null;
  whenLabel: string;
  seats: number;
  price: number;
  note: string;
  vehicle: string;
  photo: string | null;
  at: number;
};

type TripPassRecord = {
  phone: string;
  until: number;
  driverId?: string;
};

type TripAccount = {
  id: string;
  role: "rider" | "driver";
  name: string;
  phone: string;
};

const tripAccounts: TripAccount[] = [];

export type GuestKind = "rider" | "employer" | "food";

type GuestOtp = {
  kind: GuestKind;
  phone: string;
  codeHash: string;
  until: number;
  tries: number;
};

type GuestSession = {
  tokenHash: string;
  kind: GuestKind;
  phone: string;
  name: string;
  until: number;
};

const guestOtps: GuestOtp[] = [];
const guestSessions: GuestSession[] = [];
const GUEST_OTP_MS = 5 * 60_000;
const GUEST_TRIES = 5;
const GUEST_SESSION_MS = 30 * 24 * 60 * 60_000;

type OtpRecord = {
  phone: string;
  role: Role;
  code: string;
  until: number;
  tries: number;
};

const OTP_MS = 5 * 60_000;
const OTP_TRIES = 5;

const SMS_NOTE: Record<string, SmsKind> = {
  "Kuryer qabul qildi": "accepted",
  "Mahsulot olindi": "picked_up",
  "Yetkazib berildi": "delivered",
  "Buyurtma bekor": "cancelled",
  "Erkin buyurtma bekor": "cancelled",
  "Kuryer qaytardi": "released",
  "Kuryer yetib keldi": "arrived",
  "Manzil yetkazildi": "delivered",
};

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

type AdRecord = {
  id: string;
  slot: AdSlot;
  title: string;
  place: string;
  phone: string;
  paidUntil: number;
  paidSom: number;
  clicks: number;
};

const ads: AdRecord[] = [
  {
    id: "ad1",
    slot: "kitchen",
    title: "Shahrixon oshxonasi",
    place: "Markaz, Shahrixon",
    phone: "998916001101",
    paidUntil: Date.now() + WEEK_MS,
    paidSom: 80_000,
    clicks: 0,
  },
  {
    id: "ad2",
    slot: "street",
    title: "Cho'ja do'koni",
    place: "Cho'ja, Shahrixon tumani",
    phone: "998916001102",
    paidUntil: Date.now() + WEEK_MS,
    paidSom: 80_000,
    clicks: 0,
  },
  {
    id: "ad3",
    slot: "market",
    title: "Shahrixon bozori",
    place: "Bozor yo'li, Shahrixon",
    phone: "998916001103",
    paidUntil: Date.now() + WEEK_MS,
    paidSom: 80_000,
    clicks: 0,
  },
];

function fail(message: string): never {
  throw new Error(tx(message));
}

function blankProof(): OrderProof {
  return {
    pickupPhoto: null,
    dropoffPhoto: null,
    signature: null,
    senderRating: null,
    courierRating: null,
  };
}

function blankTiming() {
  return {
    acceptedAt: null as number | null,
    arrivedAt: null as number | null,
    pickedUpAt: null as number | null,
    deliveredAt: null as number | null,
    cancelledAt: null as number | null,
    waitFee: 0,
    cancelFee: 0,
    releasePenalty: 0,
  };
}

type TimedJob = {
  status: OrderStatus;
  acceptedAt: number | null;
  arrivedAt: number | null;
  pickedUpAt?: number | null;
  deliveredAt?: number | null;
  cancelledAt?: number | null;
  waitFee: number;
  cancelFee: number;
  releasePenalty: number;
  courierId: string | null;
  pingCourierId: string | null;
  pingUntil: number | null;
};

function jobTiming(job: TimedJob, feeBase: number): JobTiming {
  const freeze = job.status !== "posted" && job.status !== "accepted";
  const wait = waitClock({
    arrivedAt: job.arrivedAt,
    freeze,
    storedFee: job.waitFee,
  });
  if (job.status === "cancelled") {
    const total = job.cancelFee + wait.fee;
    return {
      acceptedAt: job.acceptedAt,
      arrivedAt: job.arrivedAt,
      pickedUpAt: job.pickedUpAt ?? null,
      deliveredAt: job.deliveredAt ?? null,
      cancelledAt: job.cancelledAt ?? null,
      waitFee: wait.fee,
      waitFreeLeftSec: 0,
      waitMaxed: wait.maxed,
      cancelAllowed: false,
      cancelFee: job.cancelFee,
      cancelTotal: total,
      cancelLabel: total > 0 ? "Bekor to'lovi kuryerga naqd" : "Bepul bekor qilindi",
      arriveAllowed: false,
      releaseAllowed: false,
      releasePenalty: 0,
      releaseLabel: "",
      noShowAllowed: false,
    };
  }
  const cancel = quoteCancel({
    status: job.status,
    acceptedAt: job.acceptedAt,
    arrivedAt: job.arrivedAt,
    feeBase,
    waitFee: wait.fee,
  });
  const release = quoteRelease({
    status: job.status,
    acceptedAt: job.acceptedAt,
    arrivedAt: job.arrivedAt,
    waitMaxed: wait.maxed,
  });
  return {
    acceptedAt: job.acceptedAt,
    arrivedAt: job.arrivedAt,
    pickedUpAt: job.pickedUpAt ?? null,
    deliveredAt: job.deliveredAt ?? null,
    cancelledAt: job.cancelledAt ?? null,
    waitFee: wait.fee,
    waitFreeLeftSec: wait.freeLeftSec,
    waitMaxed: wait.maxed,
    cancelAllowed: cancel.allowed,
    cancelFee: cancel.fee,
    cancelTotal: cancel.total,
    cancelLabel: cancel.label,
    arriveAllowed: job.status === "accepted" && job.arrivedAt == null,
    releaseAllowed: release.allowed,
    releasePenalty: release.penalty,
    releaseLabel: release.label,
    noShowAllowed: release.noShow,
  };
}

function freezeWait(job: TimedJob) {
  if (job.status === "accepted" && job.arrivedAt) {
    job.waitFee = waitClock({ arrivedAt: job.arrivedAt }).fee;
  }
}

function maybeArrive(
  job: TimedJob & { pickupLat: number | null; pickupLng: number | null },
  courier: UserRecord,
) {
  if (job.status !== "accepted" || job.arrivedAt != null) return;
  const pickup = pickupPoint(job);
  const here = freshCourierPoint(courier);
  if (!pickup || !here) return;
  if (kmBetween(here, pickup) <= ARRIVE_RADIUS_KM) {
    job.arrivedAt = Date.now();
  }
}

function applySenderCancel(job: TimedJob, feeBase: number) {
  const wait = waitClock({ arrivedAt: job.arrivedAt });
  const quote = quoteCancel({
    status: job.status,
    acceptedAt: job.acceptedAt,
    arrivedAt: job.arrivedAt,
    feeBase,
    waitFee: wait.fee,
  });
  if (!quote.allowed) {
    fail(quote.label);
  }
  freezeWait(job);
  job.cancelFee = quote.fee;
  job.status = "cancelled";
  job.cancelledAt = Date.now();
  if (quote.total === 0) {
    job.courierId = null;
    job.acceptedAt = null;
    job.arrivedAt = null;
  }
  clearPing(job);
}

function applyCourierRelease(job: TimedJob, courier: UserRecord, feeBase: number) {
  const wait = waitClock({ arrivedAt: job.arrivedAt });
  const quote = quoteRelease({
    status: job.status,
    acceptedAt: job.acceptedAt,
    arrivedAt: job.arrivedAt,
    waitMaxed: wait.maxed,
  });
  if (!quote.allowed) {
    fail(quote.label);
  }
  if (quote.noShow) {
    freezeWait(job);
    const cancel = quoteCancel({
      status: "accepted",
      acceptedAt: job.acceptedAt,
      arrivedAt: job.arrivedAt,
      feeBase,
      waitFee: job.waitFee,
    });
    job.cancelFee = cancel.fee;
    job.status = "cancelled";
    clearPing(job);
    return;
  }
  if (quote.penalty > 0) {
    if (courier.balance < quote.penalty) {
      fail(`Qaytarish uchun depozitda kamida ${formatMoney(quote.penalty)} kerak.`);
    }
    applyMoney(courier, -quote.penalty, "penalty", LEDGER_LABEL.penalty);
    job.releasePenalty += quote.penalty;
  }
  job.status = "posted";
  job.courierId = null;
  job.acceptedAt = null;
  job.arrivedAt = null;
  job.waitFee = 0;
  job.cancelFee = 0;
  clearPing(job);
}

function markJobArrived(job: TimedJob) {
  if (job.status !== "accepted") {
    fail("Avval buyurtmani qabul qiling.");
  }
  if (job.arrivedAt == null) {
    job.arrivedAt = Date.now();
  }
}

function proofOf(record: OrderProof): OrderProof {
  return {
    pickupPhoto: record.pickupPhoto,
    dropoffPhoto: record.dropoffPhoto,
    signature: record.signature,
    senderRating: record.senderRating,
    courierRating: record.courierRating,
  };
}

function optionalPhoto(uri: string | null | undefined): string | null {
  const value = (uri ?? "").trim();
  return value || null;
}

function jobPhotos(list: string[] | null | undefined, single: string | null | undefined): string[] {
  const raw = Array.isArray(list) && list.length > 0 ? list : single ? [single] : [];
  const photos = raw.map((item) => String(item).trim()).filter((item) => item.startsWith("data:image/"));
  if (photos.length > 4) fail("4 tadan ko'p rasm bo'lmaydi.");
  for (const shot of photos) {
    if (shot.length > 400_000) fail("Rasm juda katta. Boshqa rasm tanlang.");
  }
  return photos;
}

function requirePhoto(uri: string | null | undefined, message: string): string {
  const value = (uri ?? "").trim();
  if (!value) fail(message);
  return value;
}

function asStars(value: number): number {
  const stars = Math.round(value);
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
    fail("Baho 1 dan 5 gacha.");
  }
  return stars;
}

function requireUser(id: string): UserRecord {
  const user = users.find((item) => item.id === id);
  if (!user) {
    fail("Hisob topilmadi. Qayta kiring.");
  }
  return user;
}

function toSaved(user: UserRecord): SavedAddresses {
  return { home: user.home, shop: user.shop };
}

function docUriOf(user: UserRecord, kind: CourierDocKind): string | null {
  if (kind === "license") return user.licenseUri;
  if (kind === "vehicle") return user.vehicleDocUri;
  return user.passportUri;
}

function docStatusOf(user: UserRecord, kind: CourierDocKind): DocStatus {
  if (kind === "license") return user.licenseStatus;
  if (kind === "vehicle") return user.vehicleStatus;
  return user.passportStatus;
}

function docNoteOf(user: UserRecord, kind: CourierDocKind): string | null {
  if (kind === "license") return user.licenseNote;
  if (kind === "vehicle") return user.vehicleNote;
  return user.passportNote;
}

function toDocs(user: UserRecord): CourierDocs | null {
  if (user.role !== "courier") return null;
  const needed = docsNeeded(user.vehicle);
  const status: Record<CourierDocKind, DocStatus> = {
    passport: user.passportStatus,
    license: user.licenseStatus,
    vehicle: user.vehicleStatus,
  };
  const notes: Record<CourierDocKind, string | null> = {
    passport: user.passportNote,
    license: user.licenseNote,
    vehicle: user.vehicleNote,
  };
  const approved = needed.filter((kind) => status[kind] === "approved" && Boolean(docUriOf(user, kind)));
  const pending = needed.filter((kind) => status[kind] === "pending").length;
  const rejected = needed.filter((kind) => status[kind] === "rejected").length;
  const missingKinds = needed.filter((kind) => status[kind] !== "approved");
  return {
    passport: user.passportUri,
    license: user.licenseUri,
    vehicle: user.vehicleDocUri,
    needed,
    readyCount: approved.length,
    needCount: needed.length,
    ready: missingKinds.length === 0,
    pending,
    rejected,
    missing: missingKinds.length ? missingKinds.map((kind) => DOC_LABEL[kind]).join(", ") : null,
    status,
    notes,
  };
}

function docsReady(user: UserRecord): boolean {
  return toDocs(user)?.ready === true;
}

function docsWaitMessage(user: UserRecord): string {
  const docs = toDocs(user);
  if (!docs) return "Avval hujjat yuklang.";
  if (docs.rejected > 0) {
    const hit = docs.needed.find((kind) => docs.status[kind] === "rejected");
    const why = hit ? docs.notes[hit] : null;
    return why ? `Hujjat rad etildi: ${why}.` : "Hujjat rad etildi. Qayta yuklang.";
  }
  if (docs.pending > 0) return "Hujjatlar admin tekshiruvida.";
  return `Avval hujjat yuklang: ${docs.missing ?? "pasport"}.`;
}

function setDocUri(user: UserRecord, kind: CourierDocKind, uri: string) {
  if (kind === "license") {
    user.licenseUri = uri;
    user.licenseStatus = "pending";
    user.licenseNote = null;
  } else if (kind === "vehicle") {
    user.vehicleDocUri = uri;
    user.vehicleStatus = "pending";
    user.vehicleNote = null;
  } else {
    user.passportUri = uri;
    user.passportStatus = "pending";
    user.passportNote = null;
  }
}

function setDocReview(user: UserRecord, kind: CourierDocKind, status: DocStatus, note: string | null) {
  if (kind === "license") {
    user.licenseStatus = status;
    user.licenseNote = note;
  } else if (kind === "vehicle") {
    user.vehicleStatus = status;
    user.vehicleNote = note;
  } else {
    user.passportStatus = status;
    user.passportNote = note;
  }
}

function dutyBlock(courier: UserRecord, jobVehicle: VehicleKind): string | null {
  if (courier.role !== "courier") return "Buyurtmani faqat kuryer qabul qiladi.";
  if (!docsReady(courier)) {
    return docsWaitMessage(courier);
  }
  if (!vehicleFits(courier.vehicle, jobVehicle)) {
    return `Bu ish ${VEHICLE_LABEL[jobVehicle]} uchun. Sizniki: ${VEHICLE_LABEL[courier.vehicle]}.`;
  }
  if (!courier.shiftOn) return "Avval smenani oching.";
  return null;
}

function toAccount(user: UserRecord): Account {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    phone: user.phone,
    balance: user.role === "courier" ? user.balance : null,
    saved: toSaved(user),
    vehicle: user.role === "courier" ? user.vehicle : null,
    shiftOn: user.role === "courier" && user.shiftOn,
    shiftStartedAt: user.role === "courier" ? user.shiftStartedAt : null,
    docs: toDocs(user),
    isAdmin: false,
  };
}

export function attachSignedInUser(input: { id: string; role: Role; name: string; phone: string }) {
  const found = users.find((item) => item.id === input.id);
  if (found) {
    found.name = input.name;
    found.phone = input.phone;
    found.role = input.role;
    found.phoneVerified = true;
    return;
  }
  users.push({
    id: input.id,
    role: input.role,
    name: input.name,
    phone: input.phone,
    balance: 0,
    home: null,
    shop: null,
    lat: null,
    lng: null,
    locationAt: null,
    routeKm: null,
    routeMinutes: null,
    routeTargetKey: null,
    routeStamp: null,
    routeAt: null,
    vehicle: "moto",
    shiftOn: false,
    shiftStartedAt: null,
    passportUri: null,
    licenseUri: null,
    vehicleDocUri: null,
    passportStatus: "none",
    licenseStatus: "none",
    vehicleStatus: "none",
    passportNote: null,
    licenseNote: null,
    vehicleNote: null,
    phoneVerified: true,
    updatedAt: Date.now(),
  });
}

function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "");
}

function freshId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function asPoint(lat: number | null | undefined, lng: number | null | undefined): MapPoint | null {
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

type GeoJob = {
  status: OrderStatus;
  commission: number;
  pickupLat: number | null;
  pickupLng: number | null;
  pingCourierId: string | null;
  pingUntil: number | null;
  declinedBy: string[];
  vehicle: VehicleKind;
  readyAt: number;
};

function pickupPoint(job: { pickupLat: number | null; pickupLng: number | null }): MapPoint | null {
  return asPoint(job.pickupLat, job.pickupLng);
}

function dropoffPoint(job: { dropoffLat: number | null; dropoffLng: number | null }): MapPoint | null {
  return asPoint(job.dropoffLat, job.dropoffLng);
}

function asDropoffs(
  raw: Array<{ label?: string; lat?: number | null; lng?: number | null }> | null | undefined,
  fallbackLabel: string,
  fallbackPoint: MapPoint | null,
): { text: string; stops: RouteStop[] } {
  const rawRows = (raw ?? [])
    .map((item) => ({
      label: (item.label ?? "").trim(),
      point: asPoint(item.lat, item.lng),
    }))
    .filter((item) => item.label.length > 0);
  const rows =
    rawRows.length > 0
      ? rawRows
      : fallbackLabel.trim()
        ? [{ label: fallbackLabel.trim(), point: fallbackPoint }]
        : [];
  if (rows.length === 0 || rows.some((row) => row.label.length < 2)) {
    fail("Yetkazish manzilini yozing.");
  }
  if (rows.length > MAX_DROPOFFS) {
    fail(`Ko'pi bilan ${MAX_DROPOFFS} ta yetkazish manzili.`);
  }
  const complete = rows.every((row) => row.point != null);
  const stops: RouteStop[] = complete
    ? rows.map((row) => ({ label: row.label, lat: row.point!.lat, lng: row.point!.lng }))
    : [];
  return { text: rows.map((row) => row.label).join(" → "), stops };
}

function orderDropoffs(order: OrderRecord): RouteStop[] {
  if (order.dropoffs?.length) return order.dropoffs;
  const point = dropoffPoint(order);
  if (order.dropoff && point) {
    return [{ label: order.dropoff, lat: point.lat, lng: point.lng }];
  }
  return [];
}

function currentDropoffPoint(order: OrderRecord): MapPoint | null {
  const stops = orderDropoffs(order);
  const stop = stops[order.stopIndex] ?? stops[stops.length - 1];
  if (stop) return { lat: stop.lat, lng: stop.lng };
  return dropoffPoint(order);
}

function pingLive(job: GeoJob): boolean {
  return Boolean(job.pingCourierId && job.pingUntil && job.pingUntil > Date.now());
}

function courierHasPing(courierId: string): boolean {
  return (
    orders.some((order) => pingLive(order) && order.pingCourierId === courierId) ||
    errands.some((errand) => pingLive(errand) && errand.pingCourierId === courierId)
  );
}

function courierKmToPickup(job: GeoJob, courier: UserRecord): number | null {
  const pickup = pickupPoint(job);
  const here = freshCourierPoint(courier);
  if (!pickup || !here) return null;
  return kmBetween(here, pickup);
}

function eligibleForPing(job: GeoJob, courier: UserRecord): boolean {
  if (courier.role !== "courier") return false;
  if (!isJobOpen(job.readyAt)) return false;
  if (!courier.shiftOn || !docsReady(courier)) return false;
  if (!vehicleFits(courier.vehicle, job.vehicle)) return false;
  if (job.declinedBy.includes(courier.id)) return false;
  if (hasActiveJob(courier.id)) return false;
  if (courier.balance < job.commission) return false;
  if (courierHasPing(courier.id) && !(pingLive(job) && job.pingCourierId === courier.id)) return false;
  const km = courierKmToPickup(job, courier);
  return km != null && km <= matchRadiusKm(courier.vehicle);
}

function rankCouriers(job: GeoJob): { courier: UserRecord; km: number }[] {
  return users
    .filter((user) => eligibleForPing(job, user))
    .map((courier) => ({ courier, km: courierKmToPickup(job, courier) ?? matchRadiusKm(courier.vehicle) }))
    .sort((a, b) => a.km - b.km);
}

function clearPing(job: { pingCourierId: string | null; pingUntil: number | null }) {
  job.pingCourierId = null;
  job.pingUntil = null;
}

function startPing(job: GeoJob, courier: UserRecord) {
  const prev = job.pingCourierId;
  job.pingCourierId = courier.id;
  job.pingUntil = Date.now() + PING_MS;
  if (prev === courier.id) return;
  const meta = jobMeta(job);
  if (meta) {
    pushNote(courier.id, "Sizga taklif", `${meta.item} yaqin. ${PING_MS / 1000} soniya ichida qabul qiling.`, meta.id, meta.kind);
  }
}

function jobMeta(job: GeoJob): { id: string; item: string; kind: JobKind } | null {
  const order = orders.find((item) => item === job);
  if (order) return { id: order.id, item: order.item, kind: "order" };
  const errand = errands.find((item) => item === job);
  if (errand) return { id: errand.id, item: errand.item, kind: "errand" };
  return null;
}

function senderByPhone(phone: string): UserRecord | undefined {
  const key = phoneKey(phone);
  return users.find((user) => user.role === "sender" && user.phone === key);
}

function pushLedger(
  user: UserRecord,
  kind: LedgerKind,
  amount: number,
  label: string,
  jobId?: string | null,
) {
  ledgerSeq += 1;
  ledger.unshift({
    id: `L-${ledgerSeq}`,
    userId: user.id,
    kind,
    amount,
    label,
    jobId: jobId ?? null,
    at: Date.now(),
    balance: user.balance,
  });
}

function applyMoney(
  user: UserRecord,
  delta: number,
  kind: LedgerKind,
  label: string,
  jobId?: string | null,
) {
  user.balance += delta;
  pushLedger(user, kind, delta, label, jobId);
}

function asKassa(courier: UserRecord): CourierKassa {
  const entries = ledger.filter((entry) => entry.userId === courier.id);
  const sum = (kind: LedgerKind) =>
    entries.filter((entry) => entry.kind === kind).reduce((total, entry) => total + Math.abs(entry.amount), 0);
  const canMin = quoteCashout({
    balance: courier.balance,
    amount: MIN_CASHOUT_SOM,
    busy: hasActiveJob(courier.id),
  });
  return {
    balance: courier.balance,
    cashedTotal: sum("cashout"),
    commissionTotal: sum("commission"),
    penaltyTotal: sum("penalty"),
    topupTotal: sum("topup") + sum("deposit"),
    cashoutAllowed: canMin.allowed,
    cashoutReason: canMin.allowed ? null : canMin.reason,
    entries,
  };
}

function queueSms(to: string, kind: SmsKind, body: string) {
  const phone = phoneKey(to);
  if (phone.length < 9) return;
  smsSeq += 1;
  smsOutbox.unshift({
    id: `s${smsSeq}`,
    to: phone,
    kind,
    body: tx(body),
    at: Date.now(),
  });
  if (smsOutbox.length > 80) smsOutbox.length = 80;
}

const remotePushes: { to: string; title: string; body: string }[] = [];

function queuePush(userId: string, title: string, body: string) {
  const user = users.find((item) => item.id === userId);
  pushSeq += 1;
  const titleText = tx(title);
  const bodyText = tx(body);
  pushOutbox.unshift({
    id: `p${pushSeq}`,
    userId,
    who: user?.name ?? userId,
    title: titleText,
    body: bodyText,
    at: Date.now(),
  });
  if (pushOutbox.length > 80) pushOutbox.length = 80;
  if (user?.pushToken) remotePushes.push({ to: user.pushToken, title: titleText, body: bodyText });
}

export function drainRemotePushes(): { to: string; title: string; body: string }[] {
  return remotePushes.splice(0, remotePushes.length);
}

export function requeueRemotePushes(batch: { to: string; title: string; body: string }[]) {
  remotePushes.unshift(...batch);
}

export function setPushToken(userId: string, token: string) {
  const user = users.find((item) => item.id === userId);
  const next = token.trim();
  if (!user || !next || user.pushToken === next) return;
  user.pushToken = next;
  user.updatedAt = Date.now();
}

function pushNote(userId: string | null | undefined, title: string, body: string, jobId?: string | null, jobKind?: JobKind | null) {
  if (!userId) return;
  noteSeq += 1;
  notes.unshift({
    id: freshId("n"),
    userId,
    title: tx(title),
    body: tx(body),
    jobId: jobId ?? null,
    jobKind: jobKind ?? null,
    at: Date.now(),
    read: false,
    updatedAt: Date.now(),
  });
  queuePush(userId, title, body);
  accountNotify(userId, title, body);
  const kind = SMS_NOTE[title];
  if (!kind) return;
  const user = users.find((item) => item.id === userId);
  if (user) queueSms(user.phone, kind, `${title}. ${body}`);
}

function asInbox(userId: string): InboxBundle {
  const mine = notes.filter((note) => note.userId === userId);
  return { notes: mine, unread: mine.filter((note) => !note.read).length };
}

function sweepJobPings(jobs: GeoJob[]) {
  for (const job of jobs) {
    if (job.status !== "posted" || !pickupPoint(job) || !isJobOpen(job.readyAt)) {
      clearPing(job);
      continue;
    }
    if (pingLive(job)) {
      const current = users.find((user) => user.id === job.pingCourierId);
      if (current && eligibleForPing(job, current)) continue;
    }
    if (job.pingCourierId && job.pingUntil && job.pingUntil <= Date.now()) {
      if (!job.declinedBy.includes(job.pingCourierId)) {
        job.declinedBy.push(job.pingCourierId);
      }
    }
    if (job.declinedBy.length >= MAX_PINGS) {
      clearPing(job);
      continue;
    }
    const next = rankCouriers(job)[0];
    if (next) startPing(job, next.courier);
    else clearPing(job);
  }
}

function sweepPings() {
  sweepJobPings(orders);
  sweepJobPings(errands);
}

function claimOpen(job: GeoJob): boolean {
  if (job.status !== "posted" || !isJobOpen(job.readyAt)) return false;
  if (pingLive(job)) return false;
  if (job.declinedBy.length >= MAX_PINGS) return true;
  return job.declinedBy.length > 0 && rankCouriers(job).length === 0;
}

function canClaim(job: GeoJob, courier: UserRecord): boolean {
  if (!claimOpen(job)) return false;
  if (!courier.shiftOn || !docsReady(courier)) return false;
  if (!vehicleFits(courier.vehicle, job.vehicle)) return false;
  if (hasActiveJob(courier.id)) return false;
  return courier.balance >= job.commission;
}

function visiblePosted(job: GeoJob, courier: UserRecord): boolean {
  if (claimOpen(job)) return false;
  if (job.status !== "posted" || !isJobOpen(job.readyAt)) return false;
  if (!vehicleFits(courier.vehicle, job.vehicle)) return false;
  if (job.declinedBy.includes(courier.id)) return false;
  if (pingLive(job) && job.pingCourierId !== courier.id) return false;
  const pickup = pickupPoint(job);
  if (!pickup) return true;
  const here = freshCourierPoint(courier);
  if (!here) return false;
  return kmBetween(here, pickup) <= matchRadiusKm(courier.vehicle);
}

function freshCourierPoint(courier: UserRecord): MapPoint | null {
  if (courier.role !== "courier") return null;
  const point = asPoint(courier.lat, courier.lng);
  if (!point || courier.locationAt == null) return null;
  if (Date.now() - courier.locationAt > GPS_STALE_MS) return null;
  return point;
}

function courierPins(courier: UserRecord, nearby: CourierOrder[], nearbyErrands: ErrandOffer[]): MapPin[] {
  const pins: MapPin[] = [];
  const here = freshCourierPoint(courier);
  if (here) {
    pins.push({
      id: courier.id,
      kind: "courier",
      lat: here.lat,
      lng: here.lng,
      label: t("map.pin.courier"),
      tone: hasActiveJob(courier.id) ? "busy" : "free",
    });
  }
  for (const order of nearby) {
    if (order.pickupLat == null || order.pickupLng == null) continue;
    pins.push({
      id: order.id,
      kind: "job",
      lat: order.pickupLat,
      lng: order.pickupLng,
      label: t("map.pin.order"),
      tone: "job",
    });
  }
  for (const errand of nearbyErrands) {
    if (errand.pickupLat == null || errand.pickupLng == null) continue;
    pins.push({
      id: errand.id,
      kind: "job",
      lat: errand.pickupLat,
      lng: errand.pickupLng,
      label: t("map.pin.order"),
      tone: "job",
    });
  }
  return pins;
}

function senderView(order: OrderRecord): SenderOrder {
  const courier = users.find((item) => item.id === order.courierId);
  const here = courier ? freshCourierPoint(courier) : null;
  const headingTo: SenderOrder["headingTo"] =
    order.status === "accepted" ? "pickup" : order.status === "picked_up" ? "dropoff" : null;
  const target = headingTo === "pickup" ? pickupPoint(order) : headingTo === "dropoff" ? currentDropoffPoint(order) : null;
  const targetKey = target ? routeTargetKey(target) : null;
  const liveRoute =
    courier &&
    targetKey &&
    courier.routeTargetKey === targetKey &&
    courier.routeKm != null &&
    courier.routeMinutes != null &&
    courier.routeAt != null &&
    Date.now() - courier.routeAt < 180_000;
  const courierKm = liveRoute
    ? courier.routeKm
    : here && target
      ? kmBetween(here, target)
      : null;
  const eta = liveRoute ? courier.routeMinutes : etaMinutes(courierKm);
  return {
    id: order.id,
    pickup: order.pickup,
    dropoff: order.dropoff,
    item: order.item,
    deliveryFee: order.deliveryFee,
    status: order.status,
    courierName: courier?.name ?? null,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    note: order.note,
    distanceKm: order.distanceKm,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    dropoffLat: order.dropoffLat,
    dropoffLng: order.dropoffLng,
    courierLat: here?.lat ?? null,
    courierLng: here?.lng ?? null,
    courierOnline: here != null,
    courierKm,
    etaMinutes: eta,
    headingTo,
    vehicle: order.vehicle,
    readyAt: order.readyAt,
    dropoffs: orderDropoffs(order),
    stopIndex: order.stopIndex ?? 0,
    ...proofOf(order),
    ...jobTiming(order, order.deliveryFee),
  };
}

function hasActiveJob(courierId: string): boolean {
  const active = (status: OrderStatus, ownerId: string | null) =>
    ownerId === courierId && (status === "accepted" || status === "picked_up");
  return (
    orders.some((order) => active(order.status, order.courierId)) ||
    errands.some((errand) => active(errand.status, errand.courierId))
  );
}

const NEED_SUB = "Obuna qilinmagan. Buyurtma olish uchun avval hisobingizga summa kiritilishi kerak.";

function subscriptionBlock(courier: UserRecord): string | null {
  if (courier.balance > 0) return null;
  return NEED_SUB;
}

function acceptBlock(order: OrderRecord, courier: UserRecord): { allowed: boolean; reason: string | null } {
  if (order.status !== "posted") {
    return { allowed: false, reason: "Bu buyurtma band." };
  }
  if (!isJobOpen(order.readyAt)) {
    return { allowed: false, reason: "Bu buyurtma hali vaqti kelmagan." };
  }
  if (pingLive(order) && order.pingCourierId !== courier.id) {
    return { allowed: false, reason: "Bu taklif boshqa kuryerga yuborilgan." };
  }
  if (hasActiveJob(courier.id)) {
    return { allowed: false, reason: "Avval joriy buyurtmani yakunlang." };
  }
  const duty = dutyBlock(courier, order.vehicle);
  if (duty) {
    return { allowed: false, reason: duty };
  }
  const sub = subscriptionBlock(courier);
  if (sub) {
    return { allowed: false, reason: sub };
  }
  if (courier.balance < order.commission) {
    return {
      allowed: false,
      reason: `Depozit yetarli emas. Bu jo'natma uchun kamida ${formatMoney(order.commission)} kerak.`,
    };
  }
  return { allowed: true, reason: null };
}

function courierView(order: OrderRecord, courier: UserRecord): CourierOrder {
  const accept = acceptBlock(order, courier);
  const sender = users.find((item) => item.id === order.senderId);
  const revealed = order.status !== "posted";
  return {
    id: order.id,
    pickup: order.pickup,
    dropoff: order.dropoff,
    item: order.item,
    deliveryFee: order.deliveryFee,
    courierPayout: order.courierPayout,
    commission: order.commission,
    status: order.status,
    senderName: sender?.name ?? "Buyurtmachi",
    customerName: revealed ? order.customerName : "",
    customerPhone: revealed ? order.customerPhone : "",
    note: order.note,
    distanceKm: order.distanceKm,
    courierKm: courierKmToPickup(order, courier),
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    dropoffLat: order.dropoffLat,
    dropoffLng: order.dropoffLng,
    offeredToYou: pingLive(order) && order.pingCourierId === courier.id,
    pingUntil: pingLive(order) && order.pingCourierId === courier.id ? order.pingUntil : null,
    acceptAllowed: accept.allowed,
    acceptReason: accept.reason,
    commissionCharged: order.commissionCharged,
    vehicle: order.vehicle,
    readyAt: order.readyAt,
    dropoffs: orderDropoffs(order),
    stopIndex: order.stopIndex ?? 0,
    ...proofOf(order),
    ...jobTiming(order, order.deliveryFee),
  };
}

export function getPricing(): Pricing {
  return { commissionPercent: COMMISSION_PERCENT };
}

function asAdCard(ad: AdRecord): AdCard {
  return {
    id: ad.id,
    slot: ad.slot,
    title: ad.title,
    place: ad.place,
    phone: ad.phone,
    paidUntil: ad.paidUntil,
    paidSom: ad.paidSom,
    clicks: ad.clicks,
    live: ad.paidUntil > Date.now(),
  };
}

function adRevenue(): number {
  return ads.reduce((sum, ad) => sum + ad.paidSom, 0);
}

export function getAd(slot: AdSlot): AdCard | null {
  const hit = ads.find((ad) => ad.slot === asAdSlot(slot) && ad.paidUntil > Date.now());
  return hit ? asAdCard(hit) : null;
}

export function listAds(): AdCard[] {
  return ads.map(asAdCard);
}

export function clickAd(id: string): AdCard {
  const ad = ads.find((item) => item.id === id);
  if (!ad) {
    fail("Reklama topilmadi.");
  }
  if (ad.paidUntil <= Date.now()) {
    fail("Reklama muddati tugagan.");
  }
  ad.clicks += 1;
  return asAdCard(ad);
}

export function buyAd(input: {
  slot: AdSlot;
  title: string;
  place: string;
  phone: string;
  plan?: AdPlan | null;
}): AdCard {
  const title = input.title.trim();
  const place = input.place.trim();
  const phone = phoneKey(input.phone);
  const slot = asAdSlot(input.slot);
  const quote = quoteAd(asAdPlan(input.plan));
  if (title.length < 2) {
    fail("Do'kon yoki oshxona nomini yozing.");
  }
  if (place.length < 2) {
    fail("Manzilni yozing.");
  }
  if (phone.length < 9) {
    fail("Telefon raqamini to'liq yozing.");
  }
  const live = ads.find((ad) => ad.slot === slot && ad.phone === phone && ad.paidUntil > Date.now());
  if (live) {
    live.title = title;
    live.place = place;
    live.paidUntil = Math.max(live.paidUntil, Date.now()) + quote.days * DAY_MS;
    live.paidSom += quote.fee;
    return asAdCard(live);
  }
  adSeq += 1;
  const ad: AdRecord = {
    id: `ad${adSeq}`,
    slot,
    title,
    place,
    phone,
    paidUntil: Date.now() + quote.days * DAY_MS,
    paidSom: quote.fee,
    clicks: 0,
  };
  ads.unshift(ad);
  return asAdCard(ad);
}

export function quoteFee(input: {
  distanceKm: number;
  district?: string | null;
  vehicle?: VehicleKind | null;
}): FeeQuote {
  return quoteDeliveryFee(input);
}

export function register(input: {
  role: Role;
  name: string;
  phone: string;
  deposit?: number;
  vehicle?: VehicleKind | null;
}): Account {
  const name = input.name.trim();
  const phone = phoneKey(input.phone);
  if (name.length < 2) {
    fail("Ismingizni yozing.");
  }
  if (phone.length < 9) {
    fail("Telefon raqamini to'liq yozing.");
  }

  const existing = users.find((item) => item.role === input.role && item.phone === phone);
  if (existing) {
    fail("Bu telefon allaqachon ro'yxatdan o'tgan. Kirishni tanlang.");
  }

  const deposit = input.role === "courier" ? Math.round(input.deposit ?? 0) : 0;
  const balance = deposit > 0 ? deposit : 0;

  const user: UserRecord = {
    id: freshId("u"),
    role: input.role,
    name,
    phone,
    balance,
    home: null,
    shop: null,
    lat: null,
    lng: null,
    locationAt: null,
    routeKm: null,
    routeMinutes: null,
    routeTargetKey: null,
    routeStamp: null,
    routeAt: null,
    vehicle: asVehicle(input.vehicle),
    shiftOn: false,
    shiftStartedAt: null,
    passportUri: null,
    licenseUri: null,
    vehicleDocUri: null,
    passportStatus: "none",
    licenseStatus: "none",
    vehicleStatus: "none",
    passportNote: null,
    licenseNote: null,
    vehicleNote: null,
    phoneVerified: false,
    updatedAt: Date.now(),
  };
  userSeq += 1;
  users.push(user);
  if (user.role === "courier" && user.balance > 0) {
    pushLedger(user, "deposit", user.balance, LEDGER_LABEL.deposit);
  }
  return toAccount(user);
}

const OTP_SENT = "Kirish kodi yuborildi.";

/** Eski qurilma xotirasi. Haqiqiy SMS emas. Umumiy server deliveryService orqali yuboradi. */
function sendOtp(_phone: string, _code: string) {
  if (process.env.EG_OTP_DEV === "1" || smsTestMode()) return;
  fail("SMS sozlanmagan. Kirish kodi yuborilmadi.");
}

function issueOtp(role: Role, phone: string): OtpChallenge {
  const test = smsTestMode();
  const code = test ? SMS_TEST_CODE : String(1000 + Math.floor(Math.random() * 9000));
  const until = Date.now() + OTP_MS;
  const existing = otps.find((item) => item.role === role && item.phone === phone);
  if (existing) {
    existing.code = code;
    existing.until = until;
    existing.tries = 0;
  } else {
    otps.push({ phone, role, code, until, tries: 0 });
  }
  sendOtp(phone, code);
  return test ? { phone, until, testCode: SMS_TEST_CODE } : { phone, until };
}

export function requestOtp(input: { role: Role; phone: string }): OtpChallenge {
  const phone = phoneKey(input.phone);
  if (phone.length < 9) {
    fail("Telefon raqamini to'liq yozing.");
  }
  const user = users.find((item) => item.role === input.role && item.phone === phone);
  if (!user) {
    fail("Bu telefon bilan hisob topilmadi. Avval ro'yxatdan o'ting.");
  }
  return issueOtp(input.role, phone);
}

export function verifyOtp(input: { role: Role; phone: string; code: string }): Account {
  const phone = phoneKey(input.phone);
  const typed = input.code.replace(/\D/g, "");
  const row = otps.find((item) => item.role === input.role && item.phone === phone);
  if (!row) {
    fail("Avval kodni yuboring.");
  }
  if (Date.now() > row.until) {
    fail("Kod muddati tugadi. Qayta yuboring.");
  }
  if (row.tries >= OTP_TRIES) {
    fail("Kod noto'g'ri. Qayta yuboring.");
  }
  if (typed !== row.code) {
    row.tries += 1;
    fail("Kod noto'g'ri.");
  }
  const user = users.find((item) => item.role === input.role && item.phone === phone);
  if (!user) {
    fail("Bu telefon bilan hisob topilmadi. Avval ro'yxatdan o'ting.");
  }
  user.phoneVerified = true;
  const index = otps.indexOf(row);
  if (index >= 0) otps.splice(index, 1);
  return toAccount(user);
}

export function login(input: { role: Role; phone: string }): OtpChallenge {
  const phone = phoneKey(input.phone);
  if (phone.length < 9) {
    fail("Telefon raqamini to'liq yozing.");
  }
  const existing = users.find((item) => item.role === input.role && item.phone === phone);
  if (!existing) {
    fail("Bu telefon bilan hisob topilmadi. Avval ro'yxatdan o'ting.");
  }
  return issueOtp(input.role, phone);
}

export function ensureDemoPair(_input?: {
  name?: string;
  phone?: string;
  deposit?: number | null;
  vehicle?: VehicleKind | null;
}): never {
  fail("Sinov hisobi o'chirilgan.");
}

export function setCourierVehicle(courierId: string, vehicle: VehicleKind): Account {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Transport faqat kuryer uchun.");
  }
  if (courier.shiftOn) {
    fail("Transportni o'zgartirish uchun avval smenani yoping.");
  }
  if (hasActiveJob(courier.id)) {
    fail("Avval joriy buyurtmani yakunlang.");
  }
  courier.vehicle = asVehicle(vehicle);
  sweepPings();
  return toAccount(courier);
}

export function setShift(courierId: string, on: boolean): Account {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Smena faqat kuryer uchun.");
  }
  if (on) {
    if (!docsReady(courier)) {
      fail(docsWaitMessage(courier));
    }
    courier.shiftOn = true;
    if (courier.shiftStartedAt == null) {
      courier.shiftStartedAt = Date.now();
    }
  } else {
    if (hasActiveJob(courier.id)) {
      fail("Smenani yopish uchun avval joriy buyurtmani yakunlang.");
    }
    courier.shiftOn = false;
    courier.shiftStartedAt = null;
  }
  sweepPings();
  return toAccount(courier);
}

export function submitCourierDoc(courierId: string, kind: CourierDocKind, uri: string): Account {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Hujjat faqat kuryer uchun.");
  }
  if (kind !== "passport" && kind !== "license" && kind !== "vehicle") {
    fail("Hujjat turi noto'g'ri.");
  }
  setDocUri(courier, kind, requirePhoto(uri, "Hujjat rasmini oling."));
  sweepPings();
  pushNote(courier.id, "Hujjat yuborildi", `${DOC_LABEL[kind]} admin tekshiruvida.`);
  return toAccount(courier);
}

export function reviewCourierDoc(
  courierId: string,
  kind: CourierDocKind,
  ok: boolean,
  note?: string | null,
): Account {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Hujjat faqat kuryer uchun.");
  }
  if (kind !== "passport" && kind !== "license" && kind !== "vehicle") {
    fail("Hujjat turi noto'g'ri.");
  }
  if (!docUriOf(courier, kind)) {
    fail("Bu hujjat hali yuklanmagan.");
  }
  if (ok) {
    setDocReview(courier, kind, "approved", null);
    pushNote(courier.id, "Hujjat tasdiqlandi", `${DOC_LABEL[kind]} qabul qilindi.`);
    if (docsReady(courier)) {
      pushNote(courier.id, "Smenani oching", "Barcha hujjatlar tasdiqlandi.");
    }
  } else {
    const why = (note ?? "").trim() || "Qayta oling";
    setDocReview(courier, kind, "rejected", why);
    if (courier.shiftOn && !docsReady(courier)) {
      courier.shiftOn = false;
      courier.shiftStartedAt = null;
    }
    pushNote(courier.id, "Hujjat rad etildi", `${DOC_LABEL[kind]}: ${why}`);
  }
  sweepPings();
  return toAccount(courier);
}

export function getAccount(userId: string): Account {
  return toAccount(requireUser(userId));
}

export function updateProfile(userId: string, input: { name?: string; phone?: string }): Account {
  const user = requireUser(userId);
  const name = (input.name ?? user.name).trim();
  const phone = phoneKey(input.phone ?? user.phone);
  if (name.length < 2) {
    fail("Ismingizni yozing.");
  }
  if (phone.length < 9) {
    fail("Telefon raqamini to'liq yozing.");
  }
  const taken = users.find((item) => item.id !== user.id && item.role === user.role && item.phone === phone);
  if (taken) {
    fail("Bu telefon bilan boshqa hisob bor.");
  }
  const oldPhone = user.phone;
  user.name = name;
  user.phone = phone;
  for (const other of users) {
    if (other.id !== user.id && other.phone === oldPhone) {
      other.name = name;
      other.phone = phone;
    }
  }
  return toAccount(user);
}

export function listInbox(userId: string): InboxBundle {
  requireUser(userId);
  return asInbox(userId);
}

export function markInboxRead(userId: string, noteId?: string | null): InboxBundle {
  requireUser(userId);
  for (const note of notes) {
    if (note.userId !== userId) continue;
    if (noteId && note.id !== noteId) continue;
    if (note.read) continue;
    note.read = true;
    note.updatedAt = Date.now();
  }
  return asInbox(userId);
}

function chatSides(jobId: string, kind: JobKind): { senderId: string | null; courierId: string | null } {
  if (kind === "order") {
    const order = orders.find((item) => item.id === jobId);
    return { senderId: order?.senderId ?? null, courierId: order?.courierId ?? null };
  }
  const errand = errands.find((item) => item.id === jobId);
  return { senderId: errand ? senderByPhone(errand.customerPhone)?.id ?? null : null, courierId: errand?.courierId ?? null };
}

export function canChat(userId: string, jobId: string, kind: JobKind): boolean {
  const sides = chatSides(jobId, kind);
  return Boolean(sides.senderId && sides.courierId && (userId === sides.senderId || userId === sides.courierId));
}

export function listChat(userId: string, jobId: string, kind: JobKind): ChatMessage[] {
  requireUser(userId);
  if (!canChat(userId, jobId, kind)) return [];
  return chats.filter((item) => item.jobId === jobId && item.jobKind === kind);
}

export function listChatThreads(userId: string): ChatThread[] {
  requireUser(userId);
  const rows: ChatThread[] = [];
  const pushJob = (jobId: string, kind: JobKind, title: string, peerId: string | null) => {
    if (!peerId) return;
    const peer = users.find((item) => item.id === peerId);
    const mine = chats.filter((item) => item.jobId === jobId && item.jobKind === kind);
    const last = mine[mine.length - 1];
    rows.push({
      jobId,
      jobKind: kind,
      title,
      peerName: peer?.name ?? "",
      lastText: last?.text ?? "",
      lastAt: last?.at ?? 0,
    });
  };
  for (const order of orders) {
    if (!order.courierId) continue;
    if (order.senderId !== userId && order.courierId !== userId) continue;
    pushJob(order.id, "order", order.item, order.senderId === userId ? order.courierId : order.senderId);
  }
  for (const errand of errands) {
    if (!errand.courierId) continue;
    const senderId = senderByPhone(errand.customerPhone)?.id ?? null;
    if (senderId !== userId && errand.courierId !== userId) continue;
    pushJob(errand.id, "errand", errand.item, senderId === userId ? errand.courierId : senderId);
  }
  rows.sort((a, b) => b.lastAt - a.lastAt);
  return rows;
}

export function sendChat(userId: string, jobId: string, kind: JobKind, text: string): ChatMessage[] {
  const user = requireUser(userId);
  if (!canChat(userId, jobId, kind)) {
    fail("Chat buyurtma qabul qilingandan keyin ochiladi.");
  }
  const body = text.trim();
  if (body.length < 1) {
    fail("Xabar yozing.");
  }
  chatSeq += 1;
  chats.push({
    id: freshId("c"),
    jobId,
    jobKind: kind,
    fromId: user.id,
    text: body,
    at: Date.now(),
  });
  const sides = chatSides(jobId, kind);
  const other = userId === sides.senderId ? sides.courierId : sides.senderId;
  pushNote(other, "Yangi xabar", body.length > 48 ? `${body.slice(0, 48)}...` : body, jobId, kind);
  return listChat(userId, jobId, kind);
}

function asSavedPlace(label: string, lat: number, lng: number): SavedPlace {
  const text = label.trim();
  if (text.length < 2) {
    fail("Avval manzilni yozing yoki xaritadan belgilang.");
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    fail("Nuqta yo'q. Avval xaritadan belgilang.");
  }
  return { label: text, lat, lng };
}

function writeSaved(owner: SavedAddresses, slot: SavedSlot, place: SavedPlace | null): SavedAddresses {
  if (slot === "home") owner.home = place;
  else owner.shop = place;
  return { home: owner.home, shop: owner.shop };
}

function locationKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/['`‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function customRow(name: string): CustomLocation | null {
  const key = locationKey(name);
  if (key.length < 3 || key.startsWith("tanlangan nuqta")) return null;
  return customLocations.find((item) => locationKey(item.name) === key) ?? null;
}

export function matchCustomLocation(query: string): { label: string; point: MapPoint } | null {
  const row = customRow(query);
  if (!row) return null;
  return { label: row.name, point: { lat: row.lat, lng: row.lng } };
}

/** Qisman moslik: yozilgan so'z joy nomining ichida bo'lsa ham chiqadi. */
export function listCustomLocations(query: string, limit = 5): { label: string; point: MapPoint }[] {
  const key = locationKey(query);
  if (key.length < 2) return [];
  return customLocations
    .map((item) => {
      const name = locationKey(item.name);
      if (name.length < 3 || name.startsWith("tanlangan nuqta")) return null;
      let score = 0;
      if (name === key) score = 1000;
      else if (name.startsWith(key)) score = 500;
      else if (name.includes(key) || (key.includes(name) && name.length >= 4)) score = 200;
      if (score === 0) return null;
      return { item, score };
    })
    .filter((row): row is { item: CustomLocation; score: number } => row != null)
    .sort((a, b) => b.score - a.score || b.item.searchCount - a.item.searchCount || b.item.updatedAt - a.item.updatedAt)
    .slice(0, limit)
    .map((row) => ({ label: row.item.name, point: { lat: row.item.lat, lng: row.item.lng } }));
}

/** Yangi nuqta yoki noma'lum nom. Bor bo'lsa yaqinida hisob oshadi, uzoqda koordinata yangilanadi. */
export function noteCustomLocation(name: string, point: MapPoint): boolean {
  const clean = name.trim();
  const key = locationKey(clean);
  if (key.length < 3 || key.startsWith("tanlangan nuqta")) return false;
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false;
  const now = Date.now();
  const found = customLocations.find((item) => locationKey(item.name) === key);
  if (found) {
    if (kmBetween(point, { lat: found.lat, lng: found.lng }) > CUSTOM_MOVE_KM) {
      found.lat = point.lat;
      found.lng = point.lng;
    }
    found.searchCount += 1;
    found.updatedAt = now;
    return true;
  }
  if (customLocations.length >= CUSTOM_LIMIT) {
    customLocations.sort((a, b) => a.searchCount - b.searchCount || a.updatedAt - b.updatedAt);
    customLocations.shift();
  }
  customLocations.push({
    id: `loc-${now.toString(36)}`,
    name: clean,
    lat: point.lat,
    lng: point.lng,
    searchCount: 1,
    updatedAt: now,
  });
  return true;
}

export function getSavedPlaces(userId?: string | null): SavedAddresses {
  if (userId) {
    return toSaved(requireUser(userId));
  }
  return { home: guestSaved.home, shop: guestSaved.shop };
}

export function savePlace(input: {
  userId?: string | null;
  slot: SavedSlot;
  label: string;
  lat: number;
  lng: number;
}): { saved: SavedAddresses; account: Account | null } {
  const place = asSavedPlace(input.label, input.lat, input.lng);
  if (input.userId) {
    const user = requireUser(input.userId);
    const saved = writeSaved(user, input.slot, place);
    return { saved, account: toAccount(user) };
  }
  return { saved: writeSaved(guestSaved, input.slot, place), account: null };
}

export function clearPlace(input: {
  userId?: string | null;
  slot: SavedSlot;
}): { saved: SavedAddresses; account: Account | null } {
  if (input.userId) {
    const user = requireUser(input.userId);
    const saved = writeSaved(user, input.slot, null);
    return { saved, account: toAccount(user) };
  }
  return { saved: writeSaved(guestSaved, input.slot, null), account: null };
}

export function creditCourier(courierId: string, amount: number): Account {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Obuna faqat kuryer uchun.");
  }
  const next = Math.round(amount);
  if (!Number.isFinite(next) || next <= 0) {
    fail("Summa noto'g'ri.");
  }
  applyMoney(courier, next, "topup", "Obuna");
  pushNote(
    courier.id,
    "Obuna",
    `Hisobingizga ${formatMoney(next)} kiritildi. Qoldi ${formatMoney(courier.balance)}.`,
  );
  return toAccount(courier);
}

export function topUp(courierId: string, amount: number): Account {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Depozit faqat kuryer uchun.");
  }
  const next = Math.round(amount);
  if (next <= 0) {
    fail("Summa noto'g'ri.");
  }
  applyMoney(courier, next, "topup", LEDGER_LABEL.topup);
  return toAccount(courier);
}

export function getKassa(courierId: string): CourierKassa {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Kassa faqat kuryer uchun.");
  }
  return asKassa(courier);
}

export function cashout(courierId: string, amount: number): CourierKassa {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Yechish faqat kuryer uchun.");
  }
  const quote = quoteCashout({
    balance: courier.balance,
    amount,
    busy: hasActiveJob(courier.id),
  });
  if (!quote.allowed) {
    fail(quote.reason ?? "Yechib bo'lmaydi.");
  }
  applyMoney(courier, -quote.amount, "cashout", LEDGER_LABEL.cashout);
  pushNote(
    courier.id,
    "Pul yechildi",
    `${formatMoney(quote.amount)} naqd berildi. Qoldi ${formatMoney(courier.balance)}.`,
  );
  return asKassa(courier);
}

type OrderDraftInput = {
  senderId: string;
  pickup: string;
  dropoff: string;
  item: string;
  deliveryFee: number;
  customerName: string;
  customerPhone: string;
  note?: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  district?: string | null;
  vehicle?: VehicleKind | null;
  readyAt?: number | null;
  dropoffs?: Array<{ label?: string; lat?: number | null; lng?: number | null }> | null;
};

async function orderDraft(input: OrderDraftInput) {
  const pickup = input.pickup.trim();
  const dropoff = input.dropoff.trim();
  const item = input.item.trim();
  const customerName = input.customerName.trim();
  const customerPhone = phoneKey(input.customerPhone);
  const note = (input.note ?? "").trim();
  const from = asPoint(input.pickupLat, input.pickupLng);
  const to = asPoint(input.dropoffLat, input.dropoffLng);
  if (pickup.length < 2 || !item) {
    fail("Olib ketish va nima olib borilishini yozing.");
  }
  const placed = asDropoffs(input.dropoffs, dropoff, to);
  if (customerPhone.length < 9) {
    fail("Mijoz telefonini to'liq yozing.");
  }
  const vehicle = asVehicle(input.vehicle);
  const trip =
    from && placed.stops.length > 0
      ? await roadTrip(
          [from, ...placed.stops.map((stop) => ({ lat: stop.lat, lng: stop.lng }))],
          vehicle,
        )
      : null;
  let deliveryFee = Math.round(input.deliveryFee);
  if (!Number.isFinite(deliveryFee) || deliveryFee <= 0) {
    deliveryFee = quoteDeliveryFee({
      distanceKm: trip?.km ?? 0,
      district: input.district,
      vehicle,
    }).fee;
  }
  const quote = quoteDelivery(deliveryFee);
  return {
    pickup,
    dropoff: placed.text,
    item,
    customerName,
    customerPhone,
    note,
    distanceKm: trip?.km ?? null,
    pickupLat: from?.lat ?? null,
    pickupLng: from?.lng ?? null,
    dropoffLat: placed.stops[0]?.lat ?? null,
    dropoffLng: placed.stops[0]?.lng ?? null,
    dropoffs: placed.stops,
    stopIndex: 0,
    deliveryFee,
    commission: quote.commission,
    courierPayout: quote.courierPayout,
    vehicle,
    readyAt: asReadyAt(input.readyAt),
  };
}

export async function createOrder(input: OrderDraftInput): Promise<SenderOrder> {
  const sender = requireUser(input.senderId);
  if (sender.role !== "sender") {
    fail("E'lonni faqat buyurtmachi qo'yadi.");
  }
  const draft = await orderDraft(input);
  orderSeq += 1;
  const order: OrderRecord = {
    id: `PX-${freshId("")}`,
    updatedAt: Date.now(),
    senderId: sender.id,
    courierId: null,
    ...draft,
    status: "posted",
    commissionCharged: false,
    pingCourierId: null,
    pingUntil: null,
    declinedBy: [],
    ...blankTiming(),
    ...blankProof(),
  };
  orders.unshift(order);
  sweepPings();
  return senderView(order);
}

export async function placeFoodOrder(input: {
  placeId: string;
  placeName: string;
  pickup: string;
  staffPhone: string;
  name: string;
  phone: string;
  dropoff: string;
  handoff?: "pickup" | "courier" | null;
  lines: { name: string; qty: number; price: number }[];
  guestToken?: string | null;
}): Promise<FoodTicket> {
  const session = requireGuest(input.guestToken ?? "", "food");
  const name = input.name.trim() || session.name;
  const phone = session.phone;
  const handoff = input.handoff === "pickup" ? "pickup" : "courier";
  const dropoff = (handoff === "pickup" ? input.pickup : input.dropoff).trim();
  const pickup = input.pickup.trim();
  const placeName = input.placeName.trim();
  const placeId = input.placeId.trim();
  const staffPhone = phoneKey(input.staffPhone);
  const lines = input.lines
    .map((line) => ({ name: line.name.trim(), qty: Math.round(line.qty), price: Math.round(line.price) }))
    .filter((line) => line.name.length > 0 && line.qty > 0 && line.price > 0);
  if (name.length < 2) fail("Ismingizni yozing.");
  if (phone.length < 9) fail("Telefon raqamini to'liq yozing.");
  if (handoff === "courier" && dropoff.length < 2) fail("Yetkazish manzilini yozing.");
  if (pickup.length < 2 || placeName.length < 2 || placeId.length < 2 || staffPhone.length < 9) fail("E'lon topilmadi.");
  if (lines.length === 0) fail("Savat bo'sh.");
  if (!foodIsOpen(placeId)) fail("Restoran hozir buyurtma qabul qilmayapti.");
  foodSeq += 1;
  const row: FoodTicketRecord = {
    id: `f${foodSeq}`,
    placeId,
    placeName,
    pickup,
    staffPhone,
    customerName: name,
    customerPhone: phone,
    dropoff,
    handoff,
    lines,
    foodTotal: lines.reduce((sum, line) => sum + line.qty * line.price, 0),
    status: "new",
    orderId: null,
    at: Date.now(),
  };
  foodTickets.unshift(row);
  void persistFoodOrder({
    phone,
    name,
    restaurantId: placeId,
    ticketId: row.id,
    address: dropoff,
    body: {
      placeName,
      pickup,
      dropoff,
      handoff,
      lines,
      foodTotal: row.foodTotal,
      status: row.status,
    },
  }).catch(() => undefined);
  void persistFoodCart(phone, name, placeId, []).catch(() => undefined);
  notifyFoodOrder({
    ticketId: row.id,
    placeName,
    staffPhone,
    customerName: name,
    dropoff,
    handoff,
    lines: row.lines.map((line) => ({ name: line.name, qty: line.qty })),
    total: row.foodTotal,
  });
  return toFoodTicket(row);
}

export function linkKitchenChat(phone: string, chatId: number): { name: string; address: string } {
  const place = kitchenByPhone(phone);
  if (!place || !Number.isFinite(chatId)) fail("Bu telefon restoranga tegishli emas.");
  const next = { phone: place.phone, chatId };
  const found = kitchenLinks.findIndex((item) => item.phone === place.phone || item.chatId === chatId);
  if (found >= 0) kitchenLinks[found] = next;
  else kitchenLinks.push(next);
  return { name: place.name, address: place.address };
}

export function kitchenPhoneForChat(chatId: number): string | null {
  return kitchenLinks.find((item) => item.chatId === chatId)?.phone ?? null;
}

export function kitchenChatForPhone(phone: string): number | null {
  const place = kitchenByPhone(phone);
  if (!place) return null;
  return kitchenLinks.find((item) => item.phone === place.phone)?.chatId ?? null;
}

export function listKitchenForPhone(phone: string): FoodTicket[] {
  const place = kitchenByPhone(phone);
  if (!place) fail("Bu telefon restoranga tegishli emas.");
  return foodTickets
    .filter((row) => samePhone(row.staffPhone, place.phone) && row.status !== "rejected" && row.status !== "cancelled")
    .sort((a, b) => b.at - a.at)
    .map(toFoodTicket);
}

export function setKitchenOpen(phone: string, accepting: boolean): boolean {
  const place = kitchenByPhone(phone);
  if (!place) fail("Bu telefon restoranga tegishli emas.");
  const row = foodOpen.find((item) => item.placeId === place.id);
  if (row) row.accepting = accepting;
  else foodOpen.push({ placeId: place.id, accepting });
  return foodIsOpen(place.id);
}

export function kitchenReport(phone: string): { count: number; total: number } {
  const place = kitchenByPhone(phone);
  if (!place) fail("Bu telefon restoranga tegishli emas.");
  const offset = 5 * 60 * 60 * 1000;
  const start = Math.floor((Date.now() + offset) / 86_400_000) * 86_400_000 - offset;
  const rows = foodTickets.filter(
    (row) => samePhone(row.staffPhone, place.phone) && row.at >= start && row.status !== "rejected" && row.status !== "cancelled",
  );
  return { count: rows.length, total: rows.reduce((sum, row) => sum + row.foodTotal, 0) };
}

export async function kitchenStep(phone: string, ticketId: string, action: "accept" | "reject" | "ready"): Promise<{ ticket: FoodTicket; note: string }> {
  const place = kitchenByPhone(phone);
  const row = foodTickets.find((item) => item.id === ticketId && place && samePhone(item.staffPhone, place.phone));
  if (!place || !row) fail("E'lon topilmadi.");
  if (action === "reject") {
    moveFoodStatus(row, "rejected");
    return { ticket: toFoodTicket(row), note: "Buyurtma bekor qilindi." };
  }
  if (action === "accept") {
    if (row.status === "new") moveFoodStatus(row, "accepted");
    if (row.status === "accepted") moveFoodStatus(row, "preparing");
    return { ticket: toFoodTicket(row), note: "Tayyorlanmoqda." };
  }
  if (row.status === "preparing") moveFoodStatus(row, "ready");
  if (row.handoff === "pickup") return { ticket: toFoodTicket(row), note: "Mijoz o'zi olib ketadi." };
  if (row.status !== "ready") fail("Avval buyurtmani tayyor deb belgilang.");
  const owner = users.find((item) => item.role === "sender" && samePhone(item.phone, place.phone));
  if (!owner) return { ticket: toFoodTicket(row), note: "Tayyor. Kuryer uchun shu telefon buyurtmachi hisobida bo'lsin." };
  const sent = await sendKitchenToCourier(owner.id, row.id);
  return { ticket: sent, note: "Kuryerga yuborildi." };
}

export async function saveFoodCart(
  guestToken: string,
  restaurantId: string,
  lines: { foodId: string; quantity: number }[],
): Promise<void> {
  const session = requireGuest(guestToken, "food");
  const clean = lines
    .map((line) => ({ foodId: String(line.foodId ?? "").trim(), quantity: Math.round(Number(line.quantity)) }))
    .filter((line) => line.foodId.length > 0 && line.quantity > 0)
    .slice(0, 40);
  await persistFoodCart(session.phone, session.name, restaurantId.trim(), clean);
}

export function listKitchen(userId: string): KitchenDesk[] {
  const user = requireUser(userId);
  const mine = foodTickets.filter((row) => samePhone(row.staffPhone, user.phone));
  const places = new Map<string, FoodTicketRecord[]>();
  for (const row of mine) {
    const list = places.get(row.placeId) ?? [];
    list.push(row);
    places.set(row.placeId, list);
  }
  return [...places.entries()].map(([placeId, rows]) => ({
    placeId,
    placeName: rows[0]?.placeName ?? "",
    tickets: rows.sort((a, b) => b.at - a.at).map(toFoodTicket),
  }));
}

export async function sendKitchenToCourier(userId: string, ticketId: string): Promise<FoodTicket> {
  const user = requireUser(userId);
  if (user.role !== "sender") fail("E'lonni faqat buyurtmachi qo'yadi.");
  const row = foodTickets.find((item) => item.id === ticketId);
  if (!row || !samePhone(row.staffPhone, user.phone)) fail("E'lon topilmadi.");
  if (row.handoff === "pickup") fail("Bu buyurtmani mijoz o'zi olib ketadi.");
  if (row.status === "rejected") fail("Bu buyurtma rad etilgan.");
  if (row.status === "sent") fail("Bu buyurtma allaqachon kuryerga yuborilgan.");
  if (row.status !== "ready") fail("Avval buyurtmani tayyor deb belgilang.");
  const summary = row.lines.map((line) => `${line.qty}× ${line.name}`).join(", ");
  const count = row.lines.reduce((sum, line) => sum + line.qty, 0);
  const item = summary.length > 90 ? `${row.placeName}: ${count} ta taom` : `${row.placeName}: ${summary}`;
  const order = await createOrder({
    senderId: user.id,
    pickup: row.pickup,
    dropoff: row.dropoff,
    item,
    deliveryFee: 0,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    note: `${row.placeName}. Taom ${formatMoney(row.foodTotal)}`,
    vehicle: "moto",
  });
  row.status = "sent";
  row.orderId = order.id;
  return toFoodTicket(row);
}

export function foodPlaceOpen(placeId: string): boolean {
  return foodIsOpen(placeId);
}

export function getFoodTicket(ticketId: string): FoodTicket | null {
  const row = foodTickets.find((item) => item.id === ticketId);
  return row ? toFoodTicket(row) : null;
}

function ownFood(guestToken: string, ticketId: string): FoodTicketRecord {
  const session = requireGuest(guestToken, "food");
  const row = foodTickets.find((item) => item.id === ticketId && samePhone(item.customerPhone, session.phone));
  if (!row) fail("E'lon topilmadi.");
  return row;
}

export function listMyFood(guestToken: string): FoodTicket[] {
  const session = requireGuest(guestToken, "food");
  return foodTickets
    .filter((row) => samePhone(row.customerPhone, session.phone))
    .sort((a, b) => b.at - a.at)
    .map(toFoodTicket);
}

export function updateMyFood(
  guestToken: string,
  ticketId: string,
  input: { dropoff?: string | null; handoff?: "pickup" | "courier" | null; lines?: { name: string; qty: number }[] | null },
): FoodTicket {
  const row = ownFood(guestToken, ticketId);
  if (row.status !== "new") fail("Restoran qabul qilgan. Tahrir yopiq.");
  if (input.handoff === "pickup" || input.handoff === "courier") row.handoff = input.handoff;
  if (row.handoff === "pickup") row.dropoff = row.pickup;
  else if (input.dropoff != null) {
    const drop = input.dropoff.trim();
    if (drop.length < 2) fail("Yetkazish manzilini yozing.");
    row.dropoff = drop;
  }
  if (input.lines) {
    const next = input.lines.map((line) => {
      const saved = row.lines.find((item) => item.name === line.name.trim());
      if (!saved) fail("Bu taom zakazda yo'q.");
      const qty = Math.round(line.qty);
      if (qty < 1 || qty > 20) fail("Son noto'g'ri.");
      return { name: saved.name, qty, price: saved.price };
    });
    if (next.length === 0) fail("Savat bo'sh.");
    row.lines = next;
    row.foodTotal = next.reduce((sum, line) => sum + line.qty * line.price, 0);
  }
  return toFoodTicket(row);
}

export function cancelMyFood(guestToken: string, ticketId: string): FoodTicket {
  const row = ownFood(guestToken, ticketId);
  if (row.status !== "new") fail("Restoran qabul qilgan. Bekor yopiq.");
  row.status = "cancelled";
  return toFoodTicket(row);
}

function presentFoodOwner(row: FoodOwner): FoodOwnerCard {
  return {
    id: row.id,
    placeId: row.placeId,
    name: row.name,
    phone: row.phone,
    active: row.until > Date.now(),
    until: row.until,
    price: FOOD_SUB_PRICE,
    days: FOOD_SUB_DAYS,
  };
}

function foodOwnerId(): string {
  return `FO-${tripCode().slice(3)}`;
}

export function registerFoodOwner(placeId: string, name: string, phone: string): FoodOwnerCard {
  const idPlace = placeId.trim();
  const clean = name.trim();
  const key = phoneKey(phone);
  if (idPlace.length < 2) fail("E'lon topilmadi.");
  if (clean.length < 2) fail("Ismingizni yozing.");
  if (key.length < 9) fail("Telefon raqamini to'liq yozing.");
  const samePlace = foodOwners.find((item) => item.placeId === idPlace);
  if (samePlace && !samePhone(samePlace.phone, key)) fail("Bu restoran allaqachon ro'yxatdan o'tgan.");
  if (samePlace) return presentFoodOwner(samePlace);
  const row: FoodOwner = {
    id: foodOwnerId(),
    placeId: idPlace,
    name: clean,
    phone: key,
    until: Date.now() + FOOD_SUB_DAYS * 24 * 60 * 60 * 1000,
  };
  foodOwners.push(row);
  return presentFoodOwner(row);
}

export function startFoodSub(placeId: string, phone: string): FoodOwnerCard {
  const owner = requireFoodOwner(placeId, phone);
  owner.until = Date.now() + FOOD_SUB_DAYS * 24 * 60 * 60 * 1000;
  return presentFoodOwner(owner);
}

/** Test muddatni qo'yadi. Ilova bu chaqiruvni ochiq qoldirmaydi. */
export function rememberFoodOwnerUntil(placeId: string, phone: string, until: number): void {
  const owner = requireFoodOwner(placeId, phone);
  owner.until = until;
}

function requireFoodOwner(placeId: string, phone: string): FoodOwner {
  const row = foodOwners.find((item) => item.placeId === placeId && samePhone(item.phone, phone));
  if (!row) fail("Avval restoran sifatida ro'yxatdan o'ting.");
  return row;
}

function placeCanAccept(placeId: string): boolean {
  const owners = foodOwners.filter((item) => item.placeId === placeId);
  if (owners.length === 0) return true;
  return owners.some((item) => item.until > Date.now());
}

function foodDeskOf(placeId: string, phone: string): FoodDesk {
  const owner = requireFoodOwner(placeId, phone);
  const card = presentFoodOwner(owner);
  return {
    placeId,
    accepting: foodIsOpen(placeId),
    tickets: foodTickets
      .filter((row) => row.placeId === placeId)
      .sort((a, b) => b.at - a.at)
      .map(toFoodTicket),
    subActive: card.active,
    subUntil: card.until,
    subPrice: card.price,
    subDays: card.days,
  };
}

export function foodDesk(placeId: string, ownerPhone: string): FoodDesk {
  return foodDeskOf(placeId, ownerPhone);
}

export function setFoodAccepting(placeId: string, ownerPhone: string, accepting: boolean): FoodDesk {
  requireFoodOwner(placeId, ownerPhone);
  if (accepting && !placeCanAccept(placeId)) fail("Obuna tugagan. Buyurtma qabul qilish uchun obuna kerak.");
  const row = foodOpen.find((item) => item.placeId === placeId);
  if (row) row.accepting = accepting;
  else foodOpen.push({ placeId, accepting });
  return foodDeskOf(placeId, ownerPhone);
}

export function setFoodStatus(placeId: string, ownerPhone: string, ticketId: string, status: FoodTicketStatus): FoodTicket {
  requireFoodOwner(placeId, ownerPhone);
  const row = foodTickets.find((item) => item.id === ticketId && item.placeId === placeId);
  if (!row) fail("E'lon topilmadi.");
  moveFoodStatus(row, status);
  return toFoodTicket(row);
}

export function setKitchenStatus(userId: string, ticketId: string, status: FoodTicketStatus): FoodTicket {
  const user = requireUser(userId);
  const row = foodTickets.find((item) => item.id === ticketId);
  if (!row || !samePhone(row.staffPhone, user.phone)) fail("E'lon topilmadi.");
  moveFoodStatus(row, status);
  return toFoodTicket(row);
}

function foodIsOpen(placeId: string): boolean {
  if (!placeCanAccept(placeId)) return false;
  const row = foodOpen.find((item) => item.placeId === placeId);
  return row ? row.accepting : true;
}

function moveFoodStatus(row: FoodTicketRecord, status: FoodTicketStatus) {
  if (status === "accepted" && !placeCanAccept(row.placeId)) {
    fail("Obuna tugagan. Buyurtma qabul qilish uchun obuna kerak.");
  }
  const allowed =
    (row.status === "new" && (status === "accepted" || status === "rejected")) ||
    (row.status === "accepted" && (status === "preparing" || status === "rejected")) ||
    (row.status === "preparing" && status === "ready");
  if (!allowed) fail("Bu holatga o'tib bo'lmaydi.");
  row.status = status;
}

function toFoodTicket(row: FoodTicketRecord): FoodTicket {
  return {
    id: row.id,
    placeId: row.placeId,
    placeName: row.placeName,
    pickup: row.pickup,
    customerName: row.customerName,
    customerPhone: formatPhone(row.customerPhone),
    dropoff: row.dropoff,
    handoff: row.handoff === "pickup" ? "pickup" : "courier",
    lines: row.lines.map((line) => ({ ...line })),
    foodTotal: row.foodTotal,
    status: row.status,
    orderId: row.orderId,
    at: row.at,
  };
}

export async function updateOrder(senderId: string, orderId: string, input: Omit<OrderDraftInput, "senderId">): Promise<SenderOrder> {
  const sender = requireUser(senderId);
  if (sender.role !== "sender") {
    fail("E'lonni faqat buyurtmachi tahrirlaydi.");
  }
  const order = orders.find((item) => item.id === orderId && item.senderId === sender.id);
  if (!order) {
    fail("E'lon topilmadi.");
  }
  if (order.status !== "posted") {
    fail("Faqat kutilayotgan e'lonni tahrirlash mumkin.");
  }
  const draft = await orderDraft({ ...input, senderId });
  order.pickup = draft.pickup;
  order.dropoff = draft.dropoff;
  order.item = draft.item;
  order.customerName = draft.customerName;
  order.customerPhone = draft.customerPhone;
  order.note = draft.note;
  order.distanceKm = draft.distanceKm;
  order.pickupLat = draft.pickupLat;
  order.pickupLng = draft.pickupLng;
  order.dropoffLat = draft.dropoffLat;
  order.dropoffLng = draft.dropoffLng;
  order.dropoffs = draft.dropoffs;
  order.stopIndex = 0;
  order.deliveryFee = draft.deliveryFee;
  order.commission = draft.commission;
  order.courierPayout = draft.courierPayout;
  order.vehicle = draft.vehicle;
  order.readyAt = draft.readyAt;
  order.declinedBy = [];
  clearPing(order);
  sweepPings();
  return senderView(order);
}

export function listSenderOrders(senderId: string): SenderOrder[] {
  const sender = requireUser(senderId);
  if (sender.role !== "sender") {
    fail("Bu bo'lim buyurtmachi uchun.");
  }
  return orders.filter((order) => order.senderId === sender.id).map(senderView);
}

function publicPlace(text: string): string {
  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const named = parts.filter((part) => !/^\d/.test(part) && !/\d{3,}/.test(part));
  const pick = named[named.length - 1] || parts[parts.length - 1] || "Manzil";
  return pick.slice(0, 48);
}

export function listLiveJobs(): LiveJob[] {
  const live: OrderStatus[] = ["posted", "accepted", "picked_up"];
  return orders
    .filter((order) => live.includes(order.status))
    .sort((a, b) => b.readyAt - a.readyAt)
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

export function cancelOrder(senderId: string, orderId: string): SenderOrder {
  const sender = requireUser(senderId);
  const order = orders.find((item) => item.id === orderId && item.senderId === sender.id);
  if (!order) {
    fail("E'lon topilmadi.");
  }
  const held = order.courierId;
  applySenderCancel(order, order.deliveryFee);
  sweepPings();
  if (held) {
    pushNote(held, "Buyurtma bekor", `${order.item} buyurtmachi tomonidan bekor qilindi.`, order.id, "order");
  }
  return senderView(order);
}

export function getCourierBoard(courierId: string): CourierBoard {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Bu bo'lim kuryer uchun.");
  }
  sweepPings();
  void refreshCourierRoute(courier);
  const mine = orders.filter((order) => order.courierId === courier.id);
  const active =
    mine.find((order) => order.status === "accepted" || order.status === "picked_up") ?? null;
  if (active) maybeArrive(active, courier);
  const myErrands = errands.filter((errand) => errand.courierId === courier.id);
  const activeErrand =
    myErrands.find((errand) => errand.status === "accepted" || errand.status === "picked_up") ?? null;
  if (activeErrand) maybeArrive(activeErrand, courier);
  const nearby = orders
    .filter((order) => visiblePosted(order, courier))
    .map((order) => courierView(order, courier))
    .sort((a, b) => (a.courierKm ?? 99) - (b.courierKm ?? 99));
  const ping = nearby.find((order) => order.offeredToYou) ?? null;
  const nearbyErrands = errands
    .filter((errand) => visiblePosted(errand, courier))
    .map((errand) => errandOffer(errand, courier))
    .sort((a, b) => (a.courierKm ?? 99) - (b.courierKm ?? 99));
  const errandPing = nearbyErrands.find((errand) => errand.offeredToYou) ?? null;
  const waiting = orders
    .filter((order) => canClaim(order, courier))
    .map((order) => courierView(order, courier))
    .sort((a, b) => b.readyAt - a.readyAt);
  const waitingErrands = errands
    .filter((errand) => canClaim(errand, courier))
    .map((errand) => errandOffer(errand, courier));
  return {
    active: active ? courierView(active, courier) : null,
    ping,
    errandPing,
    nearby,
    completed: mine
      .filter((order) => order.status === "delivered" || order.status === "cancelled")
      .map((order) => courierView(order, courier)),
    errands: nearbyErrands,
    waiting,
    waitingErrands,
    activeErrand: activeErrand ? errandJob(activeErrand) : null,
    completedErrands: myErrands
      .filter((errand) => errand.status === "delivered" || errand.status === "cancelled")
      .map(errandJob),
    pins: courierPins(courier, nearby, nearbyErrands),
  };
}

export function acceptOrder(courierId: string, orderId: string): CourierBoard {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Buyurtmani faqat kuryer qabul qiladi.");
  }
  const order = orders.find((item) => item.id === orderId);
  if (!order) {
    fail("Buyurtma topilmadi.");
  }
  const block = acceptBlock(order, courier);
  if (!block.allowed) {
    fail(block.reason ?? "Buyurtmani qabul qilib bo'lmaydi.");
  }
  order.status = "accepted";
  order.courierId = courier.id;
  order.acceptedAt = Date.now();
  order.arrivedAt = null;
  order.waitFee = 0;
  order.cancelFee = 0;
  clearPing(order);
  pushNote(order.senderId, "Kuryer qabul qildi", `${courier.name} «${order.item}» ni oldi.`, order.id, "order");
  return getCourierBoard(courier.id);
}

export function declineOrder(courierId: string, orderId: string): CourierBoard {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Buyurtmani faqat kuryer rad etadi.");
  }
  sweepPings();
  const order = orders.find((item) => item.id === orderId);
  if (!order) {
    fail("Buyurtma topilmadi.");
  }
  if (order.status !== "posted") {
    fail("Bu buyurtma band.");
  }
  if (!pingLive(order) || order.pingCourierId !== courier.id) {
    fail("Bu taklif sizga emas.");
  }
  if (!order.declinedBy.includes(courier.id)) {
    order.declinedBy.push(courier.id);
  }
  clearPing(order);
  sweepPings();
  return getCourierBoard(courier.id);
}

async function refreshCourierRoute(courier: UserRecord) {
  const here = freshCourierPoint(courier);
  const order = orders.find(
    (item) => item.courierId === courier.id && (item.status === "accepted" || item.status === "picked_up"),
  );
  const errand = errands.find(
    (item) => item.courierId === courier.id && (item.status === "accepted" || item.status === "picked_up"),
  );
  const job = order ?? errand;
  if (!here || !job) {
    courier.routeKm = null;
    courier.routeMinutes = null;
    courier.routeTargetKey = null;
    courier.routeStamp = null;
    courier.routeAt = null;
    return;
  }
  const target =
    job.status === "picked_up"
      ? "dropoffs" in job
        ? currentDropoffPoint(job)
        : dropoffPoint(job)
      : pickupPoint(job);
  if (!target) return;
  const targetKey = routeTargetKey(target);
  const fromKey = `${here.lat.toFixed(3)},${here.lng.toFixed(3)}`;
  const stamp = `${fromKey}>${targetKey}:${job.vehicle}`;
  if (courier.routeStamp === stamp && courier.routeAt != null && Date.now() - courier.routeAt < 15_000) {
    return;
  }
  const route = await roadRoute(here, target, job.vehicle);
  courier.routeKm = route.km;
  courier.routeMinutes = route.minutes;
  courier.routeTargetKey = targetKey;
  courier.routeStamp = stamp;
  courier.routeAt = Date.now();
}

export function pingLocation(courierId: string, lat: number, lng: number): CourierBoard {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Joylashuv faqat kuryer uchun.");
  }
  const point = asPoint(lat, lng);
  if (!point) {
    fail("Joylashuv noto'g'ri.");
  }
  courier.lat = point.lat;
  courier.lng = point.lng;
  courier.locationAt = Date.now();
  sweepPings();
  const activeOrder = orders.find(
    (item) => item.courierId === courier.id && (item.status === "accepted" || item.status === "picked_up"),
  );
  const activeErrand = errands.find(
    (item) => item.courierId === courier.id && (item.status === "accepted" || item.status === "picked_up"),
  );
  if (activeOrder) maybeArrive(activeOrder, courier);
  if (activeErrand) maybeArrive(activeErrand, courier);
  void refreshCourierRoute(courier);
  return getCourierBoard(courier.id);
}

export function markPickedUp(courierId: string, orderId: string, photo: string): CourierBoard {
  const courier = requireUser(courierId);
  const order = orders.find((item) => item.id === orderId && item.courierId === courier.id);
  if (!order) {
    fail("Buyurtma topilmadi.");
  }
  if (order.status !== "accepted") {
    fail("Avval buyurtmani qabul qiling.");
  }
  const pickupShot = optionalPhoto(photo);
  if (pickupShot) order.pickupPhoto = pickupShot;
  if (order.arrivedAt == null) {
    order.arrivedAt = Date.now();
  }
  freezeWait(order);
  order.status = "picked_up";
  order.pickedUpAt = Date.now();
  pushNote(order.senderId, "Mahsulot olindi", `${order.item} yo'lda.`, order.id, "order");
  return getCourierBoard(courier.id);
}

export function markDelivered(
  courierId: string,
  orderId: string,
  photo: string,
  signature?: string | null,
): CourierBoard {
  const courier = requireUser(courierId);
  const order = orders.find((item) => item.id === orderId && item.courierId === courier.id);
  if (!order) {
    fail("Buyurtma topilmadi.");
  }
  if (order.status !== "picked_up") {
    fail("Avval buyurtmani oling.");
  }
  if (!lastDropoff(orderDropoffs(order), order.stopIndex ?? 0)) {
    order.stopIndex = (order.stopIndex ?? 0) + 1;
    const next = orderDropoffs(order)[order.stopIndex];
    pushNote(
      order.senderId,
      "Manzil yetkazildi",
      next
        ? `${order.item}: ${order.stopIndex}/${orderDropoffs(order).length} tayyor. Keyingi: ${next.label}.`
        : `${order.item}: keyingi manzilga ketmoqda.`,
      order.id,
      "order",
    );
    return getCourierBoard(courier.id);
  }
  if (order.commissionCharged) {
    fail("Foiz allaqachon yechilgan.");
  }
  if (courier.balance < order.commission) {
    fail(`Depozit yetarli emas. Kerak: ${formatMoney(order.commission)}.`);
  }
  const dropShot = optionalPhoto(photo);
  if (dropShot) order.dropoffPhoto = dropShot;
  const signed = (signature ?? "").trim();
  order.signature = signed || null;
  applyMoney(courier, -order.commission, "commission", LEDGER_LABEL.commission, order.id);
  order.commissionCharged = true;
  order.status = "delivered";
  order.deliveredAt = Date.now();
  pushNote(order.senderId, "Yetkazib berildi", `${order.item} manzilga yetdi.`, order.id, "order");
  return getCourierBoard(courier.id);
}

export function releaseOrder(courierId: string, orderId: string): CourierBoard {
  const courier = requireUser(courierId);
  const order = orders.find((item) => item.id === orderId && item.courierId === courier.id);
  if (!order) {
    fail("Buyurtma topilmadi.");
  }
  applyCourierRelease(order, courier, order.deliveryFee);
  sweepPings();
  pushNote(order.senderId, "Kuryer qaytardi", `${order.item} qayta e'longa chiqdi.`, order.id, "order");
  return getCourierBoard(courier.id);
}

export function markArrived(courierId: string, jobId: string): CourierBoard {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Yetib keldimni faqat kuryer belgilaydi.");
  }
  const order = orders.find((item) => item.id === jobId && item.courierId === courier.id);
  const errand = errands.find((item) => item.id === jobId && item.courierId === courier.id);
  const job = order ?? errand;
  if (!job) {
    fail("Buyurtma topilmadi.");
  }
  markJobArrived(job);
  if (order) {
    pushNote(order.senderId, "Kuryer yetib keldi", `${order.item} olish joyida kutmoqda.`, order.id, "order");
  } else if (errand) {
    pushNote(
      senderByPhone(errand.customerPhone)?.id,
      "Kuryer yetib keldi",
      `${errand.item} olish joyida kutmoqda.`,
      errand.id,
      "errand",
    );
  }
  return getCourierBoard(courier.id);
}

export function rateAsSender(senderId: string, orderId: string, stars: number): SenderOrder {
  const sender = requireUser(senderId);
  if (sender.role !== "sender") {
    fail("Bahoni buyurtmachi beradi.");
  }
  const order = orders.find((item) => item.id === orderId && item.senderId === sender.id);
  if (!order) {
    fail("Buyurtma topilmadi.");
  }
  if (order.status !== "delivered") {
    fail("Baho faqat yetkazilgandan keyin.");
  }
  if (order.senderRating != null) {
    fail("Siz allaqachon baho berdingiz.");
  }
  order.senderRating = asStars(stars);
  return senderView(order);
}

export function rateAsCourier(courierId: string, orderId: string, stars: number): CourierBoard {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Bahoni kuryer beradi.");
  }
  const order = orders.find((item) => item.id === orderId && item.courierId === courier.id);
  if (!order) {
    fail("Buyurtma topilmadi.");
  }
  if (order.status !== "delivered") {
    fail("Baho faqat yetkazilgandan keyin.");
  }
  if (order.courierRating != null) {
    fail("Siz allaqachon baho berdingiz.");
  }
  order.courierRating = asStars(stars);
  return getCourierBoard(courier.id);
}

function moneyAmount(value: number, label: string): number {
  const amount = Math.round(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    fail(label);
  }
  return amount;
}

function errandOffer(errand: ErrandRecord, courier: UserRecord): ErrandOffer {
  const blocked =
    errand.status !== "posted"
      ? "Bu buyurtma band."
      : !isJobOpen(errand.readyAt)
        ? "Bu buyurtma hali vaqti kelmagan."
      : pingLive(errand) && errand.pingCourierId !== courier.id
        ? "Bu taklif boshqa kuryerga yuborilgan."
        : hasActiveJob(courier.id)
          ? "Avval joriy buyurtmani yakunlang."
          : dutyBlock(courier, errand.vehicle) ??
            subscriptionBlock(courier) ??
            (courier.balance < errand.commission
              ? `Depozit yetarli emas. Bu jo'natma uchun kamida ${formatMoney(errand.commission)} kerak.`
              : null);
  return {
    id: errand.id,
    district: errand.district,
    item: errand.item,
    pickup: errand.pickup,
    productPrice: errand.productPrice,
    collectFromCustomer: errand.collectFromCustomer,
    commission: errand.commission,
    acceptAllowed: blocked == null,
    acceptReason: blocked,
    distanceKm: errand.distanceKm,
    courierKm: courierKmToPickup(errand, courier),
    pickupLat: errand.pickupLat,
    pickupLng: errand.pickupLng,
    offeredToYou: pingLive(errand) && errand.pingCourierId === courier.id,
    pingUntil: pingLive(errand) && errand.pingCourierId === courier.id ? errand.pingUntil : null,
    vehicle: errand.vehicle,
    readyAt: errand.readyAt,
  };
}

function errandJob(errand: ErrandRecord): ErrandJob {
  const courier = errand.courierId ? users.find((user) => user.id === errand.courierId) : null;
  const timing = jobTiming(errand, errand.courierFee);
  return {
    id: errand.id,
    district: errand.district,
    item: errand.item,
    pickup: errand.pickup,
    productPrice: errand.productPrice,
    collectFromCustomer: errand.collectFromCustomer + timing.waitFee,
    commission: errand.commission,
    acceptAllowed: false,
    acceptReason: null,
    distanceKm: errand.distanceKm,
    courierKm: courier ? courierKmToPickup(errand, courier) : null,
    pickupLat: errand.pickupLat,
    pickupLng: errand.pickupLng,
    offeredToYou: false,
    pingUntil: null,
    vehicle: errand.vehicle,
    readyAt: errand.readyAt,
    dropoff: errand.dropoff,
    customerPhone: errand.customerPhone,
    status: errand.status,
    commissionCharged: errand.commissionCharged,
    dropoffLat: errand.dropoffLat,
    dropoffLng: errand.dropoffLng,
    ...proofOf(errand),
    ...timing,
  };
}

function errandMine(errand: ErrandRecord): ErrandMine {
  const timing = jobTiming(errand, errand.courierFee);
  return {
    id: errand.id,
    district: errand.district,
    item: errand.item,
    status: errand.status,
    cancelAllowed: timing.cancelAllowed,
    cancelTotal: timing.cancelTotal,
    cancelLabel: timing.cancelLabel,
    waitFee: timing.waitFee,
    waitFreeLeftSec: timing.waitFreeLeftSec,
    arrivedAt: errand.arrivedAt,
    readyAt: errand.readyAt,
  };
}

export function listErrandCards(): ErrandCard[] {
  return errands
    .filter((errand) => errand.status === "posted" && isJobOpen(errand.readyAt))
    .map((errand) => ({ id: errand.id, district: errand.district, item: errand.item }));
}

export function listMyErrands(phone: string): ErrandMine[] {
  const key = phoneKey(phone);
  return errands
    .filter((errand) => errand.customerPhone === key)
    .map(errandMine);
}

export async function createErrand(input: {
  district: string;
  pickup: string;
  item: string;
  productPrice: number;
  dropoff: string;
  customerPhone: string;
  courierFee: number;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  vehicle?: VehicleKind | null;
  readyAt?: number | null;
}): Promise<ErrandMine> {
  const pickup = input.pickup.trim();
  const item = input.item.trim();
  const dropoff = input.dropoff.trim();
  const customerPhone = phoneKey(input.customerPhone);
  const from = asPoint(input.pickupLat, input.pickupLng);
  const to = asPoint(input.dropoffLat, input.dropoffLng);
  const district = input.district.trim() || guessDistrict(`${pickup} ${dropoff}`) || "";
  if (!district || !pickup || !item || !dropoff) {
    fail("Mahalla, olinadigan joy, buyurtma va manzilni yozing.");
  }
  if (!from) {
    fail("Olish joyini xaritadan belgilang.");
  }
  if (!to) {
    fail("Yetkazish joyini xaritadan belgilang.");
  }
  if (customerPhone.length < 9) {
    fail("Mijoz telefonini to'liq yozing.");
  }
  const productPrice = moneyAmount(input.productPrice, "Mahsulot narxini yozing.");
  const trip = await roadRoute(from, to, asVehicle(input.vehicle));
  const tripKm = trip.km;
  let courierFee = Math.round(input.courierFee);
  if (!Number.isFinite(courierFee) || courierFee <= 0) {
    courierFee = quoteDeliveryFee({
      distanceKm: tripKm,
      district,
      vehicle: input.vehicle,
    }).fee;
  }
  const quote = quoteErrand(productPrice, courierFee);
  const vehicle = asVehicle(input.vehicle);
  errandSeq += 1;
  const errand: ErrandRecord = {
    id: `EX-${errandSeq}`,
    district,
    pickup,
    item,
    productPrice: quote.productPrice,
    courierFee: quote.courierFee,
    commission: quote.commission,
    collectFromCustomer: quote.collectFromCustomer,
    dropoff,
    customerPhone,
    courierId: null,
    status: "posted",
    commissionCharged: false,
    distanceKm: tripKm,
    pickupLat: from.lat,
    pickupLng: from.lng,
    dropoffLat: to.lat,
    dropoffLng: to.lng,
    pingCourierId: null,
    pingUntil: null,
    declinedBy: [],
    vehicle,
    readyAt: asReadyAt(input.readyAt),
    ...blankTiming(),
    ...blankProof(),
  };
  errands.unshift(errand);
  sweepPings();
  return errandMine(errand);
}

export function cancelErrand(phone: string, errandId: string): ErrandMine {
  const errand = errands.find((item) => item.id === errandId && item.customerPhone === phoneKey(phone));
  if (!errand) {
    fail("Erkin buyurtma topilmadi.");
  }
  const held = errand.courierId;
  applySenderCancel(errand, errand.courierFee);
  sweepPings();
  if (held) {
    pushNote(held, "Erkin buyurtma bekor", `${errand.item} mijoz tomonidan bekor qilindi.`, errand.id, "errand");
  }
  return errandMine(errand);
}

export function acceptErrand(courierId: string, errandId: string): CourierBoard {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Buyurtmani faqat kuryer qabul qiladi.");
  }
  const errand = errands.find((item) => item.id === errandId);
  if (!errand) {
    fail("Erkin buyurtma topilmadi.");
  }
  const offer = errandOffer(errand, courier);
  if (!offer.acceptAllowed) {
    fail(offer.acceptReason ?? "Buyurtmani qabul qilib bo'lmaydi.");
  }
  errand.status = "accepted";
  errand.courierId = courier.id;
  errand.acceptedAt = Date.now();
  errand.arrivedAt = null;
  errand.waitFee = 0;
  errand.cancelFee = 0;
  clearPing(errand);
  pushNote(
    senderByPhone(errand.customerPhone)?.id,
    "Kuryer qabul qildi",
    `${courier.name} «${errand.item}» ni oldi.`,
    errand.id,
    "errand",
  );
  return getCourierBoard(courier.id);
}

export function declineErrand(courierId: string, errandId: string): CourierBoard {
  const courier = requireUser(courierId);
  if (courier.role !== "courier") {
    fail("Buyurtmani faqat kuryer rad etadi.");
  }
  sweepPings();
  const errand = errands.find((item) => item.id === errandId);
  if (!errand) {
    fail("Erkin buyurtma topilmadi.");
  }
  if (errand.status !== "posted") {
    fail("Bu buyurtma band.");
  }
  if (!pingLive(errand) || errand.pingCourierId !== courier.id) {
    fail("Bu taklif sizga emas.");
  }
  if (!errand.declinedBy.includes(courier.id)) {
    errand.declinedBy.push(courier.id);
  }
  clearPing(errand);
  sweepPings();
  return getCourierBoard(courier.id);
}

export function markErrandPickedUp(courierId: string, errandId: string, photo: string): CourierBoard {
  const courier = requireUser(courierId);
  const errand = errands.find((item) => item.id === errandId && item.courierId === courier.id);
  if (!errand) {
    fail("Erkin buyurtma topilmadi.");
  }
  if (errand.status !== "accepted") {
    fail("Avval buyurtmani qabul qiling.");
  }
  const pickupShot = optionalPhoto(photo);
  if (pickupShot) errand.pickupPhoto = pickupShot;
  if (errand.arrivedAt == null) {
    errand.arrivedAt = Date.now();
  }
  freezeWait(errand);
  errand.status = "picked_up";
  pushNote(senderByPhone(errand.customerPhone)?.id, "Mahsulot olindi", `${errand.item} yo'lda.`, errand.id, "errand");
  return getCourierBoard(courier.id);
}

export function markErrandDelivered(
  courierId: string,
  errandId: string,
  photo: string,
  signature?: string | null,
): CourierBoard {
  const courier = requireUser(courierId);
  const errand = errands.find((item) => item.id === errandId && item.courierId === courier.id);
  if (!errand) {
    fail("Erkin buyurtma topilmadi.");
  }
  if (errand.status !== "picked_up") {
    fail("Avval buyurtmani oling.");
  }
  if (errand.commissionCharged) {
    fail("Foiz allaqachon yechilgan.");
  }
  if (courier.balance < errand.commission) {
    fail(`Depozit yetarli emas. Kerak: ${formatMoney(errand.commission)}.`);
  }
  const dropShot = optionalPhoto(photo);
  if (dropShot) errand.dropoffPhoto = dropShot;
  const signed = (signature ?? "").trim();
  errand.signature = signed || null;
  applyMoney(courier, -errand.commission, "commission", LEDGER_LABEL.commission, errand.id);
  errand.commissionCharged = true;
  errand.status = "delivered";
  pushNote(senderByPhone(errand.customerPhone)?.id, "Yetkazib berildi", `${errand.item} manzilga yetdi.`, errand.id, "errand");
  return getCourierBoard(courier.id);
}

const liveStatuses: OrderStatus[] = ["posted", "accepted", "picked_up"];

export function getAdminBoard(): AdminBoard {
  sweepPings();
  const liveOrders = orders.filter((order) => order.status !== "cancelled");
  const liveErrands = errands.filter((errand) => errand.status !== "cancelled");
  const pins: MapPin[] = [];
  for (const order of orders) {
    if (!liveStatuses.includes(order.status) || order.pickupLat == null || order.pickupLng == null) continue;
    const pingName = pingLive(order)
      ? users.find((user) => user.id === order.pingCourierId)?.name
      : null;
    pins.push({
      id: order.id,
      kind: "job",
      lat: order.pickupLat,
      lng: order.pickupLng,
      label: pingName ? `${order.item} · ${pingName}` : order.item,
      tone: "job",
    });
  }
  for (const errand of errands) {
    if (!liveStatuses.includes(errand.status) || errand.pickupLat == null || errand.pickupLng == null) continue;
    const pingName = pingLive(errand)
      ? users.find((user) => user.id === errand.pingCourierId)?.name
      : null;
    pins.push({
      id: errand.id,
      kind: "job",
      lat: errand.pickupLat,
      lng: errand.pickupLng,
      label: pingName ? `Erkin · ${errand.item} · ${pingName}` : `Erkin · ${errand.item}`,
      tone: "job",
    });
  }
  for (const user of users) {
    if (!user.shiftOn) continue;
    const here = freshCourierPoint(user);
    if (!here) continue;
    pins.push({
      id: user.id,
      kind: "courier",
      lat: here.lat,
      lng: here.lng,
      label: user.name,
      tone: hasActiveJob(user.id) ? "busy" : "free",
    });
  }
  return {
    platformRevenue:
      orders.filter((order) => order.commissionCharged).reduce((sum, order) => sum + order.commission, 0) +
      errands.filter((errand) => errand.commissionCharged).reduce((sum, errand) => sum + errand.commission, 0) +
      orders.reduce((sum, order) => sum + order.releasePenalty, 0) +
      errands.reduce((sum, errand) => sum + errand.releasePenalty, 0) +
      adRevenue(),
    adRevenue: adRevenue(),
    turnover:
      liveOrders.reduce((sum, order) => sum + order.deliveryFee, 0) +
      liveErrands.reduce((sum, errand) => sum + errand.courierFee, 0),
    delivered:
      orders.filter((order) => order.status === "delivered").length +
      errands.filter((errand) => errand.status === "delivered").length,
    active:
      orders.filter((order) => liveStatuses.includes(order.status)).length +
      errands.filter((errand) => liveStatuses.includes(errand.status)).length,
    senders: users.filter((user) => user.role === "sender").length,
    couriers: users.filter((user) => user.role === "courier").length,
    people: users.map((user) => ({
      id: user.id,
      role: user.role,
      name: user.name,
      phone: user.phone,
      balance: user.role === "courier" ? user.balance : null,
      online: user.role === "courier" && user.shiftOn && freshCourierPoint(user) != null,
      lat: user.lat,
      lng: user.lng,
      vehicle: user.role === "courier" ? user.vehicle : null,
      shiftOn: user.role === "courier" && user.shiftOn,
      docsReady: user.role === "courier" && docsReady(user),
      docsPending: user.role === "courier" ? toDocs(user)?.pending ?? 0 : 0,
      docsRejected: user.role === "courier" ? toDocs(user)?.rejected ?? 0 : 0,
    })),
    jobs: [
      ...orders.map((order) => ({
        id: order.id,
        kind: "order" as const,
        item: order.item,
        status: order.status,
        pickup: order.pickup,
        dropoff: dropoffLine(orderDropoffs(order)) || order.dropoff,
        place: order.dropoff,
        who: users.find((user) => user.id === order.senderId)?.name ?? "Buyurtmachi",
        fee: order.deliveryFee,
        distanceKm: order.distanceKm,
        pickupLat: order.pickupLat,
        pickupLng: order.pickupLng,
        dropoffLat: order.dropoffLat,
        dropoffLng: order.dropoffLng,
        pingCourierName: pingLive(order)
          ? users.find((user) => user.id === order.pingCourierId)?.name ?? null
          : null,
        commissionCharged: order.commissionCharged,
        hasPickupPhoto: Boolean(order.pickupPhoto),
        hasDropoffPhoto: Boolean(order.dropoffPhoto),
        hasSignature: Boolean(order.signature),
        senderRating: order.senderRating,
        courierRating: order.courierRating,
        vehicle: order.vehicle,
        waitFee: jobTiming(order, order.deliveryFee).waitFee,
        cancelFee: order.cancelFee,
        releasePenalty: order.releasePenalty,
        arrived: order.arrivedAt != null,
        readyAt: order.readyAt,
      })),
      ...errands.map((errand) => ({
        id: errand.id,
        kind: "errand" as const,
        item: errand.item,
        status: errand.status,
        pickup: errand.pickup,
        dropoff: errand.dropoff,
        place: errand.dropoff,
        who: errand.district,
        fee: errand.courierFee,
        distanceKm: errand.distanceKm,
        pickupLat: errand.pickupLat,
        pickupLng: errand.pickupLng,
        dropoffLat: errand.dropoffLat,
        dropoffLng: errand.dropoffLng,
        pingCourierName: pingLive(errand)
          ? users.find((user) => user.id === errand.pingCourierId)?.name ?? null
          : null,
        commissionCharged: errand.commissionCharged,
        hasPickupPhoto: Boolean(errand.pickupPhoto),
        hasDropoffPhoto: Boolean(errand.dropoffPhoto),
        hasSignature: Boolean(errand.signature),
        senderRating: errand.senderRating,
        courierRating: errand.courierRating,
        vehicle: errand.vehicle,
        waitFee: jobTiming(errand, errand.courierFee).waitFee,
        cancelFee: errand.cancelFee,
        releasePenalty: errand.releasePenalty,
        arrived: errand.arrivedAt != null,
        readyAt: errand.readyAt,
      })),
    ],
    pins,
    ads: listAds(),
    cashoutTotal: ledger.filter((entry) => entry.kind === "cashout").reduce((sum, entry) => sum + Math.abs(entry.amount), 0),
    payouts: ledger
      .filter((entry) => entry.kind === "cashout")
      .slice(0, 20)
      .map((entry) => ({
        id: entry.id,
        courierId: entry.userId,
        who: users.find((user) => user.id === entry.userId)?.name ?? "Kuryer",
        amount: Math.abs(entry.amount),
        at: entry.at,
      })),
    reviews: listDocReviews(),
    sms: smsOutbox.slice(0, 40).map((item) => (item.kind === "otp" ? { ...item, body: tx(OTP_SENT) } : item)),
    pushes: pushOutbox.slice(0, 40),
  };
}

function listDocReviews(): AdminDocReview[] {
  const kinds: CourierDocKind[] = ["passport", "license", "vehicle"];
  const rows: AdminDocReview[] = [];
  for (const user of users) {
    if (user.role !== "courier") continue;
    const needed = docsNeeded(user.vehicle);
    for (const kind of kinds) {
      if (!needed.includes(kind)) continue;
      const status = docStatusOf(user, kind);
      const uri = docUriOf(user, kind);
      if (!uri || (status !== "pending" && status !== "rejected")) continue;
      rows.push({
        courierId: user.id,
        who: user.name,
        phone: user.phone,
        vehicle: user.vehicle,
        kind,
        uri,
        status,
        note: docNoteOf(user, kind),
      });
    }
  }
  return rows.sort((a, b) => (a.status === b.status ? 0 : a.status === "pending" ? -1 : 1));
}

export function releaseErrand(courierId: string, errandId: string): CourierBoard {
  const courier = requireUser(courierId);
  const errand = errands.find((item) => item.id === errandId && item.courierId === courier.id);
  if (!errand) {
    fail("Erkin buyurtma topilmadi.");
  }
  applyCourierRelease(errand, courier, errand.courierFee);
  sweepPings();
  pushNote(
    senderByPhone(errand.customerPhone)?.id,
    "Kuryer qaytardi",
    `${errand.item} qayta e'longa chiqdi.`,
    errand.id,
    "errand",
  );
  return getCourierBoard(courier.id);
}

function maskPhone(raw: string): string {
  let digits = phoneKey(raw);
  if (digits.startsWith("998")) digits = digits.slice(3);
  if (digits.length < 5) return "+998 ** **";
  const head = digits.slice(0, digits.length - 4);
  if (head.length >= 5) return `+998 ${head.slice(0, 2)} ${head.slice(2)} ** **`;
  return `+998 ${head} ** **`;
}

function formatPhone(raw: string): string {
  let digits = phoneKey(raw);
  if (digits.startsWith("998")) digits = digits.slice(3);
  if (digits.length === 9) {
    return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
  }
  return maskPhone(raw);
}

function scrubPhones(text: string): string {
  return text.replace(/\+?\d[\d\s\-()]{8,}\d/g, (chunk) => {
    const digits = chunk.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 13) return chunk;
    if (!digits.startsWith("998") && !digits.startsWith("9")) return chunk;
    return maskPhone(digits);
  });
}

function toTripCard(trip: TripRecord, here?: MapPoint | null): TripCard {
  const fromPoint = pointOf(trip.fromLat, trip.fromLng);
  const km = here && fromPoint ? kmBetween(here, fromPoint) : null;
  return {
    id: trip.id,
    offer: trip.offer === "driver" ? "driver" : "rider",
    passengerName: trip.passengerName,
    phoneMasked: maskPhone(trip.phone),
    from: trip.from,
    to: trip.to,
    fromLat: trip.fromLat,
    fromLng: trip.fromLng,
    toLat: trip.toLat,
    toLng: trip.toLng,
    km,
    whenLabel: trip.whenLabel,
    seats: trip.seats,
    price: trip.price,
    note: scrubPhones(trip.note),
    vehicle: trip.vehicle,
    photo: trip.photo,
    at: trip.at,
  };
}

function pointOf(lat: number | null | undefined, lng: number | null | undefined): MapPoint | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function samePlace(saved: string, wanted: string): boolean {
  return saved.trim().toLowerCase() === wanted.trim().toLowerCase();
}

function activeTripPass(key: string): TripPassRecord | null {
  const now = Date.now();
  const byId = tripPasses.find((item) => item.driverId === key && item.until > now);
  if (byId) return byId;
  const pass = tripPasses.find((item) => samePhone(item.phone, key) && item.until > now);
  return pass ?? null;
}

function tripCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let body = "";
  for (let i = 0; i < 8; i += 1) body += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `TG-${body}`;
}

export type TripAccountCard = {
  id: string;
  role: "rider" | "driver";
  name: string;
  phone: string;
};

function guestKind(value: string): GuestKind {
  if (value === "rider" || value === "employer" || value === "food") return value;
  fail("Rol noto'g'ri.");
}

function randomHex(bytes: number): string {
  const list = new Uint8Array(bytes);
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.getRandomValues) fail("Tasdiqlash ishlamadi.");
  cryptoObj.getRandomValues(list);
  return [...list].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function requireGuest(token: string, kind: GuestKind): GuestSession {
  const row = guestSessions.find((item) => item.kind === kind && token.length > 0 && sameHash(item.tokenHash, sha256(token)));
  if (row && row.until > Date.now()) return row;
  const actor = actorStore.getStore();
  const phone = actor ? phoneKey(actor.phone) : "";
  const name = actor?.name.trim() ?? "";
  if (phone.length >= 9 && name.length >= 2) {
    return { tokenHash: "", kind, phone, name, until: Date.now() + GUEST_SESSION_MS };
  }
  fail("Telefon tasdiqlanmagan. Kodni qayta yuboring.");
}

export async function requestGuestCode(kind: string, phone: string): Promise<OtpChallenge> {
  const role = guestKind(kind);
  const key = phoneKey(phone);
  if (key.length < 9) fail("Telefon raqamini to'liq yozing.");
  const test = smsTestMode();
  const code = test ? SMS_TEST_CODE : String(1000 + (Number.parseInt(randomHex(2), 16) % 9000));
  const until = Date.now() + GUEST_OTP_MS;
  if (!test) await sendLoginCode(key, code);
  const hash = sha256(code);
  const found = guestOtps.find((item) => item.kind === role && item.phone === key);
  if (found) {
    found.codeHash = hash;
    found.until = until;
    found.tries = 0;
  } else guestOtps.push({ kind: role, phone: key, codeHash: hash, until, tries: 0 });
  return test ? { phone: key, until, testCode: SMS_TEST_CODE } : { phone: key, until };
}

export async function verifyGuestCode(kind: string, phone: string, code: string, name: string): Promise<GuestPass> {
  const role = guestKind(kind);
  const key = phoneKey(phone);
  const clean = name.trim();
  const typed = code.replace(/\D/g, "");
  if (clean.length < 2) fail("Ismingizni yozing.");
  const row = guestOtps.find((item) => item.kind === role && item.phone === key);
  if (!row) fail("Avval kodni yuboring.");
  if (Date.now() > row.until) fail("Kod muddati tugadi. Qayta yuboring.");
  if (row.tries >= GUEST_TRIES) fail("Kod noto'g'ri. Qayta yuboring.");
  if (!sameHash(sha256(typed), row.codeHash)) {
    row.tries += 1;
    fail("Kod noto'g'ri.");
  }
  guestOtps.splice(guestOtps.indexOf(row), 1);
  const token = randomHex(32);
  const until = Date.now() + GUEST_SESSION_MS;
  guestSessions.push({ tokenHash: sha256(token), kind: role, phone: key, name: clean, until });
  if (role === "food") void persistFoodUser(key, clean).catch(() => undefined);
  return { token, phone: key, name: clean, until };
}

export function registerTripAccount(role: "rider" | "driver", name: string, phone: string, guestToken?: string | null): TripAccountCard {
  const clean = name.trim();
  if (role !== "rider" && role !== "driver") fail("Rol noto'g'ri.");
  if (clean.length < 2) fail("Ismingizni yozing.");
  const session = role === "rider" ? requireGuest(guestToken ?? "", "rider") : null;
  const key = session ? session.phone : phoneKey(phone);
  if (key.length < 9) fail("Telefon raqamini to'liq yozing.");
  const found = tripAccounts.find((item) => item.role === role && samePhone(item.phone, key));
  if (found) {
    if (role === "driver") grantDriverTrial(found.id, key);
    return { ...found };
  }
  let id = tripCode();
  while (tripAccounts.some((item) => item.id === id)) id = tripCode();
  const row: TripAccount = { id, role, name: clean, phone: key };
  tripAccounts.push(row);
  if (role === "driver") grantDriverTrial(row.id, key);
  return { ...row };
}

function grantDriverTrial(driverId: string, phone: string): void {
  if (!driverId) return;
  const has = tripPasses.some((item) => item.driverId === driverId || samePhone(item.phone, phone));
  if (has) return;
  tripPasses.push({
    phone,
    driverId,
    until: Date.now() + TRIP_PASS_DAYS * 24 * 60 * 60 * 1000,
  });
}

function tripOwner(id: string): TripAccount {
  const account = tripAccounts.find((item) => item.id === id);
  if (!account) fail("Ro'yxat topilmadi.");
  return account;
}

function driverByKey(key: string): TripAccount {
  const account =
    tripAccounts.find((item) => item.id === key && item.role === "driver") ??
    tripAccounts.find((item) => item.role === "driver" && samePhone(item.phone, key));
  if (!account) fail("Haydovchi ro'yxati topilmadi.");
  return account;
}

export async function listTrips(query?: TripQuery | null): Promise<TripCard[]> {
  await pullTrips();
  const mode = query?.mode ?? "near";
  const here = pointOf(query?.lat, query?.lng);
  const from = query?.from?.trim() ?? "";
  const to = query?.to?.trim() ?? "";
  return trips
    .filter((trip) => {
      if (mode === "route") {
        if (from && !samePlace(trip.from, from)) return false;
        if (to && !samePlace(trip.to, to)) return false;
        return true;
      }
      const origin = pointOf(trip.fromLat, trip.fromLng);
      if (!here || !origin) return false;
      return kmBetween(here, origin) <= TRIP_NEAR_KM;
    })
    .sort((a, b) => b.at - a.at)
    .map((trip) => toTripCard(trip, here));
}

export type TripWrite = {
  name: string;
  phone: string;
  from: string;
  to: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  whenLabel: string;
  seats: number;
  price: number;
  note?: string | null;
  vehicle?: string | null;
  photo?: string | null;
  accountId?: string | null;
};

function readTripWrite(input: TripWrite): Omit<TripRecord, "id" | "at"> {
  const name = input.name.trim();
  const owner = input.accountId ? tripOwner(input.accountId) : null;
  const phone = owner ? owner.phone : phoneKey(input.phone);
  const offer: "rider" | "driver" = owner?.role === "driver" ? "driver" : "rider";
  const from = input.from.trim();
  const to = input.to.trim();
  const fromPoint = pointOf(input.fromLat, input.fromLng);
  const toPoint = pointOf(input.toLat, input.toLng);
  const whenLabel = input.whenLabel.trim();
  const seats = Math.round(input.seats);
  const price = Math.round(input.price);
  if (name.length < 2) fail("Ismingizni yozing.");
  if (phone.length < 9) fail("Telefon raqamini to'liq yozing.");
  if (from.length < 2 || to.length < 2) fail("Qayerdan va qayerga yozing.");
  if (!fromPoint || !toPoint) fail("Jo'nash va borish nuqtasini tanlang.");
  if (whenLabel.length < 3) fail("Qachon ketishingizni yozing.");
  if (seats < 1 || seats > 4) fail("O'rin 1 dan 4 gacha.");
  if (!Number.isFinite(price) || price < 0) fail("Narxni yozing.");
  const vehicle = offer === "driver" ? (input.vehicle ?? "").trim().slice(0, 40) : "";
  const shot = (input.photo ?? "").trim();
  if (offer === "driver" && shot && (!shot.startsWith("data:image/") || shot.length > 500_000)) fail("Rasm juda katta. Boshqa rasm tanlang.");
  return {
    offer,
    passengerName: name,
    phone,
    from,
    to,
    fromLat: fromPoint.lat,
    fromLng: fromPoint.lng,
    toLat: toPoint.lat,
    toLng: toPoint.lng,
    whenLabel,
    seats,
    price,
    note: scrubPhones((input.note ?? "").trim()),
    vehicle,
    photo: offer === "driver" && shot ? shot : null,
  };
}

export async function postTrip(input: TripWrite): Promise<TripCard> {
  tripSeq += 1;
  const trip: TripRecord = { id: `t${tripSeq}`, ...readTripWrite(input), at: Date.now() };
  if (tripRepo) await tripRepo.upsert(storedTrip(trip));
  trips.unshift(trip);
  return toTripCard(trip);
}

export async function listMyTrips(accountId: string): Promise<TripCard[]> {
  const account = tripOwner(accountId);
  await pullTrips();
  return trips
    .filter((trip) => samePhone(trip.phone, account.phone) && (trip.offer === "driver" ? "driver" : "rider") === account.role)
    .sort((a, b) => b.at - a.at)
    .map((trip) => toTripCard(trip));
}

export async function updateTrip(id: string, accountId: string, input: TripWrite): Promise<TripCard> {
  const account = tripOwner(accountId);
  const trip = trips.find((item) => item.id === id);
  const side = trip?.offer === "driver" ? "driver" : "rider";
  if (!trip || !samePhone(trip.phone, account.phone) || side !== account.role) fail("E'lon topilmadi.");
  const next: TripRecord = { ...trip, ...readTripWrite({ ...input, accountId }) };
  if (tripRepo) await tripRepo.upsert(storedTrip(next));
  Object.assign(trip, next);
  return toTripCard(trip);
}

export async function deleteTrip(id: string, accountId: string): Promise<void> {
  const account = tripOwner(accountId);
  const index = trips.findIndex(
    (item) => item.id === id && samePhone(item.phone, account.phone) && (item.offer === "driver" ? "driver" : "rider") === account.role,
  );
  if (index < 0) fail("E'lon topilmadi.");
  if (tripRepo) await tripRepo.remove(id);
  trips.splice(index, 1);
}

function samePhone(a: string, b: string): boolean {
  const left = phoneKey(a).slice(-9);
  const right = phoneKey(b).slice(-9);
  return left.length === 9 && left === right;
}

function builderAverage(row: BuilderRecord): { stars: number | null; count: number } {
  if (row.ratings.length === 0) return { stars: null, count: 0 };
  const sum = row.ratings.reduce((total, item) => total + item.stars, 0);
  return { stars: Math.round((sum / row.ratings.length) * 10) / 10, count: row.ratings.length };
}

function toBuilderCard(row: BuilderRecord): BuilderCard {
  const score = builderAverage(row);
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    phone: formatPhone(row.phone),
    trade: row.trade,
    address: row.address,
    text: row.text,
    photo: row.photos?.[0] ?? row.photo,
    photos: (row.photos ?? (row.photo ? [row.photo] : [])).slice(0, 4),
    stars: score.stars,
    ratingCount: score.count,
    at: row.at,
    region: row.region ?? "",
    area: row.area ?? "",
    experience: row.experience ?? "",
    price: row.price ?? null,
    payKind: row.payKind === "deal" || row.payKind === "fixed" ? row.payKind : "",
    term: row.term === "day" || row.term === "temp" || row.term === "steady" ? row.term : "",
    workers: row.workers ?? 0,
    status: jobStatus(row),
    contactOpen: true,
  };
}

function maskJobPhone(raw: string): string {
  let digits = phoneKey(raw);
  if (digits.startsWith("998")) digits = digits.slice(3);
  if (digits.length < 9) return "+998 ** *** ** **";
  const local = digits.slice(-9);
  return `+998 ${local.slice(0, 2)} *** ** ${local.slice(7)}`;
}

function presentBuilder(row: BuilderRecord, open: boolean): BuilderCard {
  const card = toBuilderCard(row);
  if (row.kind !== "job" || open) return card;
  let text = scrubPhones(row.text);
  const street = row.address.trim();
  if (street.length >= 2) text = text.split(street).join(" ").replace(/\s{2,}/g, " ").trim();
  return {
    ...card,
    phone: maskJobPhone(row.phone),
    address: "",
    text,
    contactOpen: false,
  };
}

async function masterUntil(phone: string): Promise<number | null> {
  const key = phoneKey(phone);
  if (key.length < 9) return null;
  const memory = masterSubs.find((item) => samePhone(item.phone, key));
  let until = memory && memory.until > Date.now() ? memory.until : null;
  if (constructionRepo) {
    const remote = await constructionRepo.subscriptionUntil(key);
    if (remote != null && remote > Date.now() && (until == null || remote > until)) until = remote;
  }
  return until;
}

async function masterContactOpen(phone?: string | null): Promise<boolean> {
  return (await masterUntil(phone ?? "")) != null;
}

function masterPass(until: number | null): MasterPass {
  return { active: until != null, until, price: MASTER_SUB_PRICE, days: MASTER_SUB_DAYS };
}

export async function masterSubStatus(phone: string): Promise<MasterPass> {
  return masterPass(await masterUntil(phone));
}

export async function registerMaster(name: string, phone: string): Promise<MasterPass> {
  const clean = name.trim();
  if (clean.length < 2) fail("Ismingizni yozing.");
  const key = phoneKey(phone);
  if (key.length < 9) fail("Telefon raqamini to'liq yozing.");
  const found = masterSubs.find((item) => samePhone(item.phone, key));
  if (!found) {
    masterSubs.push({ phone: key, until: Date.now() + MASTER_SUB_DAYS * 24 * 60 * 60 * 1000 });
  }
  return masterSubStatus(key);
}

export async function startMasterSub(phone: string): Promise<MasterPass> {
  const key = phoneKey(phone);
  if (key.length < 9) fail("Telefon raqamini to'liq yozing.");
  const found = masterSubs.find((item) => samePhone(item.phone, key));
  if (!found) fail("Avval usta sifatida ro'yxatdan o'ting.");
  found.until = Date.now() + MASTER_SUB_DAYS * 24 * 60 * 60 * 1000;
  return masterSubStatus(key);
}

/** To'lov tasdiqlangach server yoki test yozadi. Ilova bu chaqiruvni ochiq qoldirmaydi. */
export function rememberMasterSubscription(phone: string, until: number): void {
  const key = phoneKey(phone);
  if (key.length < 9) fail("Telefon raqamini to'liq yozing.");
  if (!Number.isFinite(until)) fail("Obuna muddati yaroqsiz.");
  const found = masterSubs.find((item) => samePhone(item.phone, key));
  if (found) found.until = until;
  else masterSubs.push({ phone: key, until });
}

export async function listBuilders(kind?: "offer" | "job" | null, viewerPhone?: string | null): Promise<BuilderCard[]> {
  const open = await masterContactOpen(viewerPhone);
  return builders
    .filter((row) => jobStatus(row) === "active" && (kind === "offer" || kind === "job" ? row.kind === kind : true))
    .sort((a, b) => b.at - a.at)
    .map((row) => presentBuilder(row, open));
}

export type BuilderWrite = {
  kind: "offer" | "job";
  name: string;
  phone: string;
  trade?: string | null;
  address?: string | null;
  text: string;
  photo?: string | null;
  photos?: string[] | null;
  region?: string | null;
  area?: string | null;
  experience?: string | null;
  price?: number | null;
  payKind?: string | null;
  term?: string | null;
  workers?: number | null;
  guestToken?: string | null;
};

function readPay(value: string | null | undefined): BuilderPay {
  return value === "deal" || value === "fixed" ? value : "";
}

function readTerm(value: string | null | undefined): BuilderTerm {
  return value === "day" || value === "temp" || value === "steady" ? value : "";
}

function readBuilderBody(input: BuilderWrite): Omit<BuilderRecord, "id" | "at" | "ratings"> {
  const kind = input.kind === "job" ? "job" : "offer";
  const name = input.name.trim();
  const phone = phoneKey(input.phone);
  const trade = (input.trade ?? "").trim();
  const region = (input.region ?? "").trim();
  const area = (input.area ?? "").trim();
  let address = (input.address ?? "").trim();
  if (!address && (region || area)) address = [region, area].filter(Boolean).join(", ");
  const text = input.text.trim();
  const photos = input.kind === "job" ? jobPhotos(input.photos, input.photo) : [];
  const photo = photos[0] ?? optionalPhoto(input.photo);
  const experience = (input.experience ?? "").trim();
  const payKind = readPay(input.payKind);
  const term = readTerm(input.term);
  let price: number | null = null;
  if (input.price != null) {
    price = Math.round(Number(input.price));
    if (!Number.isFinite(price) || price < 0) fail("Narxni yozing.");
  }
  const workers = input.workers == null ? (kind === "job" ? 1 : 0) : Math.round(Number(input.workers));
  const modern = Boolean(region || area || input.payKind || input.term || experience);
  if (name.length < 2) fail("Ismingizni yozing.");
  if (phone.length < 9) fail("Telefon raqamini to'liq yozing.");
  if (kind === "offer" && trade.length < 2) fail("Sohangizni yozing.");
  if (kind === "job" && modern && trade.length < 2) fail("Kasbni tanlang.");
  if (kind === "job" && address.length < 2) fail("Manzilni yozing.");
  if (text.length < 8) fail("Ishni batafsil yozing.");
  if (kind === "job" && (!Number.isFinite(workers) || workers < 1 || workers > 50)) fail("Ishchilar sonini yozing.");
  if (payKind === "fixed" && price == null) fail("Narxni yozing.");
  if (payKind === "deal") price = null;
  return {
    kind,
    name,
    phone,
    trade,
    address,
    text,
    photo,
    photos,
    region,
    area,
    experience,
    price,
    payKind,
    term,
    workers: kind === "job" ? workers : 0,
  };
}

export async function postBuilder(input: BuilderWrite): Promise<BuilderCard> {
  const body = readBuilderBody(input);
  if (body.kind === "job") body.phone = requireGuest(input.guestToken ?? "", "employer").phone;
  builderSeq += 1;
  const row: BuilderRecord = {
    id: body.kind === "job" ? freshJobId() : `b${builderSeq}`,
    ...body,
    ratings: [],
    at: Date.now(),
    status: "active",
  };
  builders.unshift(row);
  await saveConstructionJob(row);
  return presentBuilder(row, true);
}

export async function listMyBuilders(phone: string, kind?: "offer" | "job" | null, guestToken?: string | null): Promise<BuilderCard[]> {
  const key = kind === "job" ? requireGuest(guestToken ?? "", "employer").phone : phoneKey(phone);
  if (key.length < 9) fail("Telefon raqamini to'liq yozing.");
  return builders
    .filter((row) => {
      if (row.kind === "job") return kind === "job" && samePhone(row.phone, key);
      if (kind === "job") return false;
      return samePhone(row.phone, key);
    })
    .sort((a, b) => b.at - a.at)
    .map((row) => presentBuilder(row, true));
}

export async function updateBuilder(id: string, ownerPhone: string, input: BuilderWrite): Promise<BuilderCard> {
  const row = builders.find((item) => item.id === id);
  const phone = row?.kind === "job" ? requireGuest(input.guestToken ?? "", "employer").phone : phoneKey(ownerPhone);
  if (!row || !samePhone(row.phone, phone)) fail("E'lon topilmadi.");
  const body = readBuilderBody({ ...input, kind: row.kind });
  if (row.kind === "job") body.phone = phone;
  Object.assign(row, body, { id: row.id, ratings: row.ratings, at: row.at, status: jobStatus(row) });
  await saveConstructionJob(row);
  return presentBuilder(row, true);
}

export async function closeBuilder(id: string, ownerPhone: string, guestToken?: string | null): Promise<BuilderCard> {
  const row = builders.find((item) => item.id === id);
  const phone = row?.kind === "job" ? requireGuest(guestToken ?? "", "employer").phone : phoneKey(ownerPhone);
  if (!row || !samePhone(row.phone, phone)) fail("E'lon topilmadi.");
  if (row.kind !== "job") fail("Bu ish e'loni emas.");
  row.status = "filled";
  await saveConstructionJob(row);
  return presentBuilder(row, true);
}

export async function deleteBuilder(id: string, ownerPhone: string, guestToken?: string | null): Promise<void> {
  const rowHit = builders.find((item) => item.id === id);
  const phone = rowHit?.kind === "job" ? requireGuest(guestToken ?? "", "employer").phone : phoneKey(ownerPhone);
  const index = builders.findIndex((item) => item.id === id && samePhone(item.phone, phone));
  if (index < 0) fail("E'lon topilmadi.");
  const row = builders[index];
  if (row?.kind === "job" && constructionRepo) await constructionRepo.removeJob(row.id);
  builders.splice(index, 1);
}

export function rateBuilder(id: string, phone: string, stars: number): BuilderCard {
  const row = builders.find((item) => item.id === id);
  if (!row) fail("E'lon topilmadi.");
  const key = phoneKey(phone);
  if (key.length < 9) fail("Telefon raqamini to'liq yozing.");
  if (samePhone(key, row.phone)) fail("O'z e'loningizga baho berilmaydi.");
  if (row.ratings.some((item) => samePhone(item.phone, key))) fail("Siz baho bergansiz.");
  row.ratings.push({ phone: key, stars: asStars(stars) });
  return presentBuilder(row, row.kind !== "job");
}

export function tripPassStatus(driverKey: string): TripPass {
  const account = tripAccounts.find((item) => item.id === driverKey && item.role === "driver")
    ?? tripAccounts.find((item) => item.role === "driver" && samePhone(item.phone, driverKey));
  const pass = account ? activeTripPass(account.id) ?? activeTripPass(account.phone) : activeTripPass(driverKey);
  return {
    active: Boolean(pass),
    until: pass?.until ?? null,
    price: TRIP_PASS_PRICE,
    days: TRIP_PASS_DAYS,
    driverId: account?.id ?? pass?.driverId ?? null,
  };
}

export function rememberTripPassUntil(driverId: string, until: number): void {
  const row = tripPasses.find((item) => item.driverId === driverId);
  if (!row) fail("Obuna topilmadi.");
  row.until = until;
}

export function startTripPass(driverKey: string): TripPass {
  const account = driverByKey(driverKey);
  const until = Date.now() + TRIP_PASS_DAYS * 24 * 60 * 60 * 1000;
  const found = tripPasses.find((item) => item.driverId === account.id || samePhone(item.phone, account.phone));
  if (found) {
    found.until = until;
    found.driverId = account.id;
    found.phone = account.phone;
  } else tripPasses.push({ phone: account.phone, driverId: account.id, until });
  return tripPassStatus(account.id);
}

export async function revealTripPhone(tripId: string, driverKey: string): Promise<TripReveal> {
  await pullTrips();
  const trip = trips.find((item) => item.id === tripId);
  if (!trip) fail("E'lon topilmadi.");
  const account = tripAccounts.find((item) => item.id === driverKey && item.role === "driver");
  if (!account && phoneKey(driverKey).length < 9) fail("Telefon raqamini to'liq yozing.");
  if (!activeTripPass(account?.id ?? driverKey)) {
    return { ok: false, price: TRIP_PASS_PRICE, days: TRIP_PASS_DAYS };
  }
  return { ok: true, phone: formatPhone(trip.phone), address: scrubPhones(trip.note) };
}

export type StoreSnapshot = {
  v: 1;
  users: UserRecord[];
  orders: OrderRecord[];
  errands: ErrandRecord[];
  guestSaved: SavedAddresses;
  notes: InboxNote[];
  chats: ChatMessage[];
  ledger: LedgerEntry[];
  ads: AdRecord[];
  sms: SmsOutbox[];
  pushes: PushOutbox[];
  otps: OtpRecord[];
  userSeq: number;
  orderSeq: number;
  errandSeq: number;
  adSeq: number;
  noteSeq: number;
  chatSeq: number;
  ledgerSeq: number;
  smsSeq: number;
  pushSeq: number;
  trips: TripRecord[];
  tripPasses: TripPassRecord[];
  tripAccounts?: TripAccount[];
  guestSessions?: GuestSession[];
  tripSeq: number;
  builders?: BuilderRecord[];
  builderSeq?: number;
  masterSubs?: MasterSubRecord[];
  foodTickets?: FoodTicketRecord[];
  kitchenLinks?: { phone: string; chatId: number }[];
  foodSeq?: number;
  foodOpen?: { placeId: string; accepting: boolean }[];
  foodOwners?: FoodOwner[];
  customLocations?: CustomLocation[];
};

export function sharedState() {
  return { users, orders, chats, notes };
}

export function exportSnapshot(): StoreSnapshot {
  return {
    v: 1,
    users: users.slice(),
    orders: orders.slice(),
    errands: errands.slice(),
    guestSaved: { ...guestSaved },
    notes: notes.slice(),
    chats: chats.slice(),
    ledger: ledger.slice(),
    ads: ads.slice(),
    sms: smsOutbox.map((item) => (item.kind === "otp" ? { ...item, body: OTP_SENT } : item)),
    pushes: pushOutbox.slice(),
    otps: otps.slice(),
    userSeq,
    orderSeq,
    errandSeq,
    adSeq,
    noteSeq,
    chatSeq,
    ledgerSeq,
    smsSeq,
    pushSeq,
    trips: trips.slice(),
    tripPasses: tripPasses.slice(),
    tripAccounts: tripAccounts.slice(),
    guestSessions: guestSessions.slice(),
    tripSeq,
    builders: builders.slice(),
    builderSeq,
    masterSubs: masterSubs.slice(),
    foodTickets: foodTickets.slice(),
    kitchenLinks: kitchenLinks.slice(),
    foodSeq,
    foodOpen: foodOpen.slice(),
    foodOwners: foodOwners.slice(),
    customLocations: customLocations.slice(),
  };
}

function refill<T>(target: T[], next: T[]) {
  target.length = 0;
  for (const item of next) target.push(item);
}

export function importSnapshot(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const snap = raw as Partial<StoreSnapshot>;
  if (snap.v !== 1) return false;
  if (!Array.isArray(snap.users) || !Array.isArray(snap.orders) || !Array.isArray(snap.errands)) {
    return false;
  }
  refill(users, snap.users);
  refill(orders, snap.orders);
  refill(errands, snap.errands);
  if (snap.guestSaved && typeof snap.guestSaved === "object") {
    guestSaved = {
      home: snap.guestSaved.home ?? null,
      shop: snap.guestSaved.shop ?? null,
    };
  }
  if (Array.isArray(snap.notes)) refill(notes, snap.notes);
  if (Array.isArray(snap.chats)) refill(chats, snap.chats);
  if (Array.isArray(snap.ledger)) refill(ledger, snap.ledger);
  if (Array.isArray(snap.ads) && snap.ads.length > 0) refill(ads, snap.ads);
  if (Array.isArray(snap.sms)) {
    refill(
      smsOutbox,
      snap.sms.map((item) => (item.kind === "otp" ? { ...item, body: OTP_SENT } : item)),
    );
  }
  if (Array.isArray(snap.pushes)) refill(pushOutbox, snap.pushes);
  if (Array.isArray(snap.otps)) refill(otps, snap.otps);
  if (typeof snap.userSeq === "number") userSeq = snap.userSeq;
  if (typeof snap.orderSeq === "number") orderSeq = snap.orderSeq;
  if (typeof snap.errandSeq === "number") errandSeq = snap.errandSeq;
  if (typeof snap.adSeq === "number") adSeq = snap.adSeq;
  if (typeof snap.noteSeq === "number") noteSeq = snap.noteSeq;
  if (typeof snap.chatSeq === "number") chatSeq = snap.chatSeq;
  if (typeof snap.ledgerSeq === "number") ledgerSeq = snap.ledgerSeq;
  if (typeof snap.smsSeq === "number") smsSeq = snap.smsSeq;
  if (typeof snap.pushSeq === "number") pushSeq = snap.pushSeq;
  if (Array.isArray(snap.trips)) refill(trips, snap.trips);
  if (Array.isArray(snap.tripPasses)) refill(tripPasses, snap.tripPasses);
  if (Array.isArray(snap.tripAccounts)) refill(tripAccounts, snap.tripAccounts);
  if (Array.isArray(snap.guestSessions)) refill(guestSessions, snap.guestSessions);
  if (typeof snap.tripSeq === "number") tripSeq = snap.tripSeq;
  if (Array.isArray(snap.builders)) refill(builders, snap.builders);
  if (typeof snap.builderSeq === "number") builderSeq = snap.builderSeq;
  if (Array.isArray(snap.masterSubs)) refill(masterSubs, snap.masterSubs);
  if (Array.isArray(snap.foodTickets)) refill(foodTickets, snap.foodTickets);
  if (Array.isArray(snap.kitchenLinks)) refill(kitchenLinks, snap.kitchenLinks);
  if (typeof snap.foodSeq === "number") foodSeq = snap.foodSeq;
  if (Array.isArray(snap.foodOpen)) refill(foodOpen, snap.foodOpen);
  if (Array.isArray(snap.foodOwners)) refill(foodOwners, snap.foodOwners);
  if (Array.isArray(snap.customLocations)) refill(customLocations, snap.customLocations);
  return true;
}
