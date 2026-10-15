export type Role = "sender" | "courier";

export type BuilderKind = "offer" | "job";
export type BuilderPay = "" | "deal" | "fixed";
export type BuilderTerm = "" | "day" | "temp" | "steady";

export type BuilderCard = {
  id: string;
  kind: BuilderKind;
  name: string;
  phone: string;
  trade: string;
  address: string;
  text: string;
  photo: string | null;
  stars: number | null;
  ratingCount: number;
  at: number;
  region: string;
  area: string;
  experience: string;
  price: number | null;
  payKind: BuilderPay;
  term: BuilderTerm;
  workers: number;
  status: "active" | "filled";
  contactOpen: boolean;
};

export type FoodLine = {
  name: string;
  qty: number;
  price: number;
};

export type FoodTicketStatus = "new" | "accepted" | "preparing" | "ready" | "rejected" | "sent" | "cancelled";

export type FoodHandoff = "pickup" | "courier";

export type FoodTicket = {
  id: string;
  placeId: string;
  placeName: string;
  pickup: string;
  customerName: string;
  customerPhone: string;
  dropoff: string;
  handoff: FoodHandoff;
  lines: FoodLine[];
  foodTotal: number;
  status: FoodTicketStatus;
  orderId: string | null;
  at: number;
};

export type KitchenDesk = {
  placeId: string;
  placeName: string;
  tickets: FoodTicket[];
};

export type FoodDesk = {
  placeId: string;
  accepting: boolean;
  tickets: FoodTicket[];
  subActive: boolean;
  subUntil: number | null;
  subPrice: number;
  subDays: number;
};

export type FoodOwnerCard = {
  id: string;
  placeId: string;
  name: string;
  phone: string;
  active: boolean;
  until: number;
  price: number;
  days: number;
};

export type TripCard = {
  id: string;
  passengerName: string;
  phoneMasked: string;
  from: string;
  to: string;
  fromLat: number | null;
  fromLng: number | null;
  toLat: number | null;
  toLng: number | null;
  km: number | null;
  whenLabel: string;
  seats: number;
  price: number;
  note: string;
  at: number;
};

export type TripQuery = {
  mode: "near" | "route";
  lat?: number | null;
  lng?: number | null;
  from?: string | null;
  to?: string | null;
};

export type MasterPass = {
  active: boolean;
  until: number | null;
  price: number;
  days: number;
};

export type TripPass = {
  active: boolean;
  until: number | null;
  price: number;
  days: number;
  driverId: string | null;
};

export type TripReveal = { ok: true; phone: string; address: string } | { ok: false; price: number; days: number };

export type LiveJob = {
  id: string;
  pickup: string;
  dropoff: string;
  item: string;
  vehicle: VehicleKind;
  deliveryFee: number;
  status: OrderStatus;
  at: number;
  region: string;
  district: string;
};

export type OrderStatus = "posted" | "accepted" | "picked_up" | "delivered" | "cancelled";

export type SavedSlot = "home" | "shop";

export type SavedPlace = {
  label: string;
  lat: number;
  lng: number;
};

export type SavedAddresses = {
  home: SavedPlace | null;
  shop: SavedPlace | null;
};

export type Account = {
  id: string;
  role: Role;
  name: string;
  phone: string;
  balance: number | null;
  saved: SavedAddresses;
  vehicle: VehicleKind | null;
  shiftOn: boolean;
  shiftStartedAt: number | null;
  docs: CourierDocs | null;
  isAdmin: boolean;
};

export type VehicleKind = "walk" | "moto" | "car" | "cargo";

export type RouteStop = {
  label: string;
  lat: number;
  lng: number;
};

export type CourierDocKind = "passport" | "license" | "vehicle";

export type DocStatus = "none" | "pending" | "approved" | "rejected";

export type CourierDocs = {
  passport: string | null;
  license: string | null;
  vehicle: string | null;
  needed: CourierDocKind[];
  readyCount: number;
  needCount: number;
  ready: boolean;
  pending: number;
  rejected: number;
  missing: string | null;
  status: Record<CourierDocKind, DocStatus>;
  notes: Record<CourierDocKind, string | null>;
};

export type AdminDocReview = {
  courierId: string;
  who: string;
  phone: string;
  vehicle: VehicleKind;
  kind: CourierDocKind;
  uri: string;
  status: "pending" | "rejected";
  note: string | null;
};

export type AdSlot = "kitchen" | "street" | "market";

export type AdPlan = "day" | "week" | "month";

export type AdCard = {
  id: string;
  slot: AdSlot;
  title: string;
  place: string;
  phone: string;
  paidUntil: number;
  paidSom: number;
  clicks: number;
  live: boolean;
};

export type Pricing = {
  commissionPercent: number;
};

export type LedgerKind = "deposit" | "topup" | "commission" | "penalty" | "cashout";

export type LedgerEntry = {
  id: string;
  userId: string;
  kind: LedgerKind;
  amount: number;
  label: string;
  jobId: string | null;
  at: number;
  balance: number;
};

export type CourierKassa = {
  balance: number;
  cashedTotal: number;
  commissionTotal: number;
  penaltyTotal: number;
  topupTotal: number;
  cashoutAllowed: boolean;
  cashoutReason: string | null;
  entries: LedgerEntry[];
};

export type AdminPayout = {
  id: string;
  courierId: string;
  who: string;
  amount: number;
  at: number;
};

export type FeeQuote = {
  distanceKm: number;
  fee: number;
  detail: string;
  surgeLabel: string;
  vehicle: VehicleKind;
  district: string | null;
};

export type MapPin = {
  id: string;
  kind: "job" | "courier";
  lat: number;
  lng: number;
  label: string;
  tone: "job" | "free" | "busy";
};

export type OrderProof = {
  pickupPhoto: string | null;
  dropoffPhoto: string | null;
  signature: string | null;
  senderRating: number | null;
  courierRating: number | null;
};

export type JobTiming = {
  acceptedAt: number | null;
  arrivedAt: number | null;
  pickedUpAt: number | null;
  deliveredAt: number | null;
  cancelledAt: number | null;
  waitFee: number;
  waitFreeLeftSec: number;
  waitMaxed: boolean;
  cancelAllowed: boolean;
  cancelFee: number;
  cancelTotal: number;
  cancelLabel: string;
  arriveAllowed: boolean;
  releaseAllowed: boolean;
  releasePenalty: number;
  releaseLabel: string;
  noShowAllowed: boolean;
};

export type SenderOrder = {
  id: string;
  pickup: string;
  dropoff: string;
  item: string;
  deliveryFee: number;
  status: OrderStatus;
  cancelAllowed: boolean;
  courierName: string | null;
  customerName: string;
  customerPhone: string;
  note: string;
  distanceKm: number | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  courierLat: number | null;
  courierLng: number | null;
  courierOnline: boolean;
  courierKm: number | null;
  etaMinutes: number | null;
  headingTo: "pickup" | "dropoff" | null;
  vehicle: VehicleKind;
  readyAt: number;
  dropoffs: RouteStop[];
  stopIndex: number;
} & OrderProof &
  JobTiming;

export type CourierOrder = {
  id: string;
  pickup: string;
  dropoff: string;
  item: string;
  deliveryFee: number;
  courierPayout: number;
  commission: number;
  status: OrderStatus;
  senderName: string;
  customerName: string;
  customerPhone: string;
  note: string;
  distanceKm: number | null;
  courierKm: number | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  offeredToYou: boolean;
  pingUntil: number | null;
  acceptAllowed: boolean;
  acceptReason: string | null;
  commissionCharged: boolean;
  vehicle: VehicleKind;
  readyAt: number;
  dropoffs: RouteStop[];
  stopIndex: number;
} & OrderProof &
  JobTiming;

export type ErrandCard = {
  id: string;
  district: string;
  item: string;
};

export type ErrandMine = ErrandCard & {
  status: OrderStatus;
  cancelAllowed: boolean;
  cancelTotal: number;
  cancelLabel: string;
  waitFee: number;
  waitFreeLeftSec: number;
  arrivedAt: number | null;
  readyAt: number;
};

export type ErrandOffer = {
  id: string;
  district: string;
  item: string;
  pickup: string;
  productPrice: number;
  collectFromCustomer: number;
  commission: number;
  acceptAllowed: boolean;
  acceptReason: string | null;
  distanceKm: number | null;
  courierKm: number | null;
  pickupLat: number | null;
  pickupLng: number | null;
  offeredToYou: boolean;
  pingUntil: number | null;
  vehicle: VehicleKind;
  readyAt: number;
};

export type ErrandJob = ErrandOffer &
  OrderProof & {
    dropoff: string;
    customerPhone: string;
    status: OrderStatus;
    commissionCharged: boolean;
    dropoffLat: number | null;
    dropoffLng: number | null;
  } & JobTiming;

export type CourierBoard = {
  active: CourierOrder | null;
  ping: CourierOrder | null;
  errandPing: ErrandOffer | null;
  nearby: CourierOrder[];
  waiting: CourierOrder[];
  waitingErrands: ErrandOffer[];
  completed: CourierOrder[];
  errands: ErrandOffer[];
  activeErrand: ErrandJob | null;
  completedErrands: ErrandJob[];
  pins: MapPin[];
};

export type AdminJob = {
  id: string;
  kind: "order" | "errand";
  item: string;
  status: OrderStatus;
  pickup: string;
  dropoff: string;
  place: string;
  who: string;
  fee: number;
  distanceKm: number | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  pingCourierName: string | null;
  commissionCharged: boolean;
  hasPickupPhoto: boolean;
  hasDropoffPhoto: boolean;
  hasSignature: boolean;
  senderRating: number | null;
  courierRating: number | null;
  vehicle: VehicleKind;
  waitFee: number;
  cancelFee: number;
  releasePenalty: number;
  arrived: boolean;
  readyAt: number;
};

export type AdminPerson = {
  id: string;
  role: Role;
  name: string;
  phone: string;
  balance: number | null;
  online: boolean;
  lat: number | null;
  lng: number | null;
  vehicle: VehicleKind | null;
  shiftOn: boolean;
  docsReady: boolean;
  docsPending: number;
  docsRejected: number;
};

export type JobKind = "order" | "errand";

export type InboxNote = {
  id: string;
  userId: string;
  title: string;
  body: string;
  jobId: string | null;
  jobKind: JobKind | null;
  at: number;
  read: boolean;
  updatedAt?: number;
};

export type InboxBundle = {
  notes: InboxNote[];
  unread: number;
};

export type ChatMessage = {
  id: string;
  jobId: string;
  jobKind: JobKind;
  fromId: string;
  text: string;
  at: number;
};

export type ChatThread = {
  jobId: string;
  jobKind: JobKind;
  title: string;
  peerName: string;
  lastText: string;
  lastAt: number;
};

export type SmsKind = "otp" | "accepted" | "picked_up" | "delivered" | "cancelled" | "arrived" | "released";

export type SmsOutbox = {
  id: string;
  to: string;
  kind: SmsKind;
  body: string;
  at: number;
};

export type OtpChallenge = {
  phone: string;
  until: number;
  testCode?: string;
};

export type GuestPass = {
  token: string;
  phone: string;
  name: string;
  until: number;
};

export type AuthSession = {
  account: Account;
  token: string;
};

export type PushOutbox = {
  id: string;
  userId: string;
  who: string;
  title: string;
  body: string;
  at: number;
};

export type AdminBoard = {
  platformRevenue: number;
  adRevenue: number;
  turnover: number;
  delivered: number;
  active: number;
  senders: number;
  couriers: number;
  jobs: AdminJob[];
  people: AdminPerson[];
  pins: MapPin[];
  ads: AdCard[];
  cashoutTotal: number;
  payouts: AdminPayout[];
  reviews: AdminDocReview[];
  sms: SmsOutbox[];
  pushes: PushOutbox[];
};
