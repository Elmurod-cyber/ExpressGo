/** Server qoidasi. Ilova ekranlari bu hisobni qilmaydi. */
import type { AdPlan, AdSlot, CourierDocKind, DocStatus, FeeQuote, LedgerKind, OrderStatus, RouteStop, VehicleKind } from "../types";
import { t } from "../i18n";

export const COMMISSION_PERCENT = 15;
/** Taklif masofasi: piyoda 1, moto 2, mashina 3, kargo 4 km. */
export const MATCH_RADIUS_KM: Record<VehicleKind, number> = {
  walk: 1,
  moto: 2,
  car: 3,
  cargo: 4,
};
export const PING_MS = 7_000;
export const GPS_STALE_MS = 120_000;
export const MAX_PINGS = 5;
/** OSRM yo'l vaqti bo'lmasa, taxminiy tezlik. */
export const CITY_SPEED_KMH = 20;
export const FEE_START_SOM = 8000;
export const FEE_PER_KM_SOM = 3500;
export const MAX_DROPOFFS = 3;
export const DEMO_COURIER_DEPOSIT = 100_000;
export const MIN_CASHOUT_SOM = 10_000;
export const CASHOUT_AMOUNTS = [20_000, 50_000, 100_000] as const;
export const TOPUP_AMOUNTS = [50_000, 100_000, 200_000] as const;
/** Hamyon: kuryer shu rekvizitga o'tkazadi. Aniq ma'lumot keyin almashtiriladi. */
export const TOPUP_PAY = {
  card: "8600 1234 5678 9000",
  phone: "+998 (90) 000-00-00",
  telegram: "****",
} as const;
/** Shaharlararo haydovchi: ro'yxatdan keyin 30 kun bepul, keyin oylik obuna. Pul yechilmaydi. */
export const TRIP_PASS_DAYS = 30;
export const TRIP_PASS_PRICE = 99_000;
/** Fastfud egasi: ro'yxatdan keyin 30 kun bepul, keyin shu narx. Pul yechilmaydi. */
export const FOOD_SUB_DAYS = 30;
export const FOOD_SUB_PRICE = 99_000;
/** Quruvchi usta: ro'yxatdan keyin 30 kun bepul, keyin oylik obuna. Pul yechilmaydi. */
export const MASTER_SUB_DAYS = 30;
export const MASTER_SUB_PRICE = 99_000;
/** Shaharlararo: jo'nash nuqtasi haydovchidan shu masofada bo'lsa "atrofimda"ga tushadi. */
export const TRIP_NEAR_KM = 15;
export const LEDGER_LABEL: Record<LedgerKind, string> = {
  get deposit() {
    return t("ledger.deposit");
  },
  get topup() {
    return t("ledger.topup");
  },
  get commission() {
    return t("ledger.commission");
  },
  get penalty() {
    return t("ledger.penalty");
  },
  get cashout() {
    return t("ledger.cashout");
  },
};

export function quoteCashout(input: {
  balance: number;
  amount: number;
  busy: boolean;
}): { allowed: boolean; amount: number; left: number; reason: string | null } {
  const balance = Math.max(0, Math.round(input.balance));
  const amount = Math.round(input.amount);
  if (input.busy) {
    return { allowed: false, amount: 0, left: balance, reason: t("cash.busy") };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { allowed: false, amount: 0, left: balance, reason: t("cash.bad") };
  }
  if (amount < MIN_CASHOUT_SOM) {
    return {
      allowed: false,
      amount: 0,
      left: balance,
      reason: t("cash.min", { n: MIN_CASHOUT_SOM.toLocaleString("uz-UZ") }),
    };
  }
  if (amount > balance) {
    return { allowed: false, amount: 0, left: balance, reason: t("cash.low") };
  }
  return { allowed: true, amount, left: balance - amount, reason: null };
}

export const MAHALLAS = [
  "Shahrixon",
  "O'rta Shahrixon",
  "Yuqori Shahrixon",
  "Qo'rg'oncha",
  "Cho'ja",
  "Segaza",
  "Abdubiy",
  "Nazarmahram",
  "Naynavo",
  "Paxtaobod",
  "Toshtepa",
  "Guliston",
  "Eshonqishloq",
  "Yangiyo'l",
  "Vaxim",
  "Dorilomon",
] as const;

export const DISTRICTS = MAHALLAS;

const DISTRICT_MULT: Record<string, number> = {
  Shahrixon: 1,
  "O'rta Shahrixon": 1,
  "Yuqori Shahrixon": 1.05,
  "Qo'rg'oncha": 1.08,
  "Cho'ja": 1.25,
  Segaza: 1.22,
  Abdubiy: 1.15,
  Nazarmahram: 1.18,
  Naynavo: 1.15,
  Paxtaobod: 1.12,
  Toshtepa: 1.2,
  Guliston: 1.12,
  Eshonqishloq: 1.25,
  "Yangiyo'l": 1.15,
  Vaxim: 1.22,
  Dorilomon: 1.1,
};

const VEHICLE_MULT: Record<VehicleKind, number> = {
  walk: 0.8,
  moto: 1,
  car: 1.35,
  /** Vaqtincha mashina bilan bir xil. Aniq kargo narxini keyin almashtiramiz. */
  cargo: 1.35,
};

/** Tanlovda chiqadigan tariflar. Piyoda yopilgan. */
export const COURIER_VEHICLES: VehicleKind[] = ["moto", "car", "cargo"];

export const VEHICLE_LABEL: Record<VehicleKind, string> = {
  get walk() {
    return t("vehicle.walk");
  },
  get moto() {
    return t("vehicle.moto");
  },
  get car() {
    return t("vehicle.car");
  },
  get cargo() {
    return t("vehicle.cargo");
  },
};

export function asVehicle(value?: VehicleKind | null): VehicleKind {
  return value === "walk" || value === "car" || value === "cargo" ? value : "moto";
}

export function matchRadiusKm(vehicle?: VehicleKind | null): number {
  return MATCH_RADIUS_KM[asVehicle(vehicle)];
}

const VEHICLE_RANK: Record<VehicleKind, number> = {
  walk: 1,
  moto: 2,
  car: 3,
  cargo: 4,
};

export function vehicleFits(courierVehicle: VehicleKind, jobVehicle: VehicleKind): boolean {
  const courier = asVehicle(courierVehicle);
  const job = asVehicle(jobVehicle);
  if (courier === "cargo" || job === "cargo") return courier === job;
  return VEHICLE_RANK[courier] >= VEHICLE_RANK[job];
}

export const DOC_LABEL: Record<CourierDocKind, string> = {
  get passport() {
    return t("doc.passport");
  },
  get license() {
    return t("doc.license");
  },
  get vehicle() {
    return t("doc.vehicle");
  },
};

export function docsNeeded(vehicle: VehicleKind): CourierDocKind[] {
  return asVehicle(vehicle) === "walk" ? ["passport"] : ["passport", "license", "vehicle"];
}

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  get none() {
    return t("doc.none");
  },
  get pending() {
    return t("doc.pending");
  },
  get approved() {
    return t("doc.approved");
  },
  get rejected() {
    return t("doc.rejected");
  },
};

export const DOC_REJECT_REASONS = ["Rasm noaniq", "Hujjat mos emas", "Qayta oling"] as const;

export const READY_SLOTS = [
  { id: "now" as const, ms: 0, get label() { return t("ready.now"); } },
  { id: "30" as const, ms: 30 * 60_000, get label() { return t("ready.30"); } },
  { id: "60" as const, ms: 60 * 60_000, get label() { return t("ready.60"); } },
  { id: "120" as const, ms: 2 * 60 * 60_000, get label() { return t("ready.120"); } },
];

export type ReadySlotId = (typeof READY_SLOTS)[number]["id"];

export function asReadyAt(value?: number | null, at: number = Date.now()): number {
  if (value == null || !Number.isFinite(value)) return at;
  if (value <= at + 15_000) return at;
  return Math.min(Math.round(value), at + 24 * 60 * 60 * 1000);
}

export function isJobOpen(readyAt: number, at: number = Date.now()): boolean {
  return readyAt <= at;
}

export function formatReadyAt(readyAt: number, at: number = Date.now()): string {
  if (readyAt <= at + 20_000) return t("ready.now");
  const local = (stamp: number) => {
    const t = new Date(stamp + 5 * 60 * 60 * 1000);
    return {
      day: t.getUTCDate(),
      month: t.getUTCMonth(),
      hour: String(t.getUTCHours()).padStart(2, "0"),
      minute: String(t.getUTCMinutes()).padStart(2, "0"),
    };
  };
  const when = local(readyAt);
  const now = local(at);
  const clock = `${when.hour}:${when.minute}`;
  if (when.day === now.day && when.month === now.month) return clock;
  return t("ready.other_day", { day: when.day, clock });
}

export function readySlotOf(readyAt: number, at: number = Date.now()): ReadySlotId {
  const left = readyAt - at;
  if (left > 90 * 60_000) return "120";
  if (left > 40 * 60_000) return "60";
  if (left > 10 * 60_000) return "30";
  return "now";
}

export function readyHint(readyAt: number, at: number = Date.now()): string | null {
  if (isJobOpen(readyAt, at)) return null;
  return t("ready.hint", { time: formatReadyAt(readyAt, at) });
}

export function dropoffLine(stops: Pick<RouteStop, "label">[]): string {
  return stops.map((stop) => stop.label.trim()).filter(Boolean).join(" → ");
}

export function lastDropoff(stops: RouteStop[], stopIndex: number): boolean {
  if (stops.length <= 1) return true;
  return stopIndex >= stops.length - 1;
}

export function etaMinutes(km: number | null): number | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  return Math.max(1, Math.round((km / CITY_SPEED_KMH) * 60));
}

export function guessDistrict(text: string): string | null {
  const hay = text.toLowerCase().replace(/['`‘’]/g, "");
  const names = [...MAHALLAS].sort((a, b) => b.length - a.length);
  for (const mahalla of names) {
    const needle = mahalla.toLowerCase().replace(/['`‘’]/g, "");
    if (hay.includes(needle)) return mahalla;
  }
  return null;
}

function localHour(at: number): number {
  return (new Date(at).getUTCHours() + 5) % 24;
}

export function surgeAt(at: number = Date.now()): { mult: number; label: string } {
  const hour = localHour(at);
  if (hour >= 18 && hour < 21) return { mult: 1.2, label: t("surge.evening") };
  if (hour >= 7 && hour < 9) return { mult: 1.15, label: t("surge.morning") };
  if (hour >= 12 && hour < 14) return { mult: 1.1, label: t("surge.lunch") };
  if (hour >= 22 || hour < 6) return { mult: 1.3, label: t("surge.night") };
  return { mult: 1, label: t("surge.normal") };
}

export function quoteDeliveryFee(input: {
  distanceKm: number;
  district?: string | null;
  vehicle?: VehicleKind | null;
  at?: number;
}): FeeQuote {
  const km =
    !Number.isFinite(Number(input.distanceKm)) || Number(input.distanceKm) < 0
      ? 0
      : Math.round(Number(input.distanceKm) * 10) / 10;
  const vehicle = asVehicle(input.vehicle);
  const district = input.district?.trim() || null;
  const districtMult = district && DISTRICT_MULT[district] ? DISTRICT_MULT[district] : district ? 1 : 1;
  const vehicleMult = VEHICLE_MULT[vehicle];
  const surge = surgeAt(input.at ?? Date.now());
  const base = FEE_START_SOM + km * FEE_PER_KM_SOM;
  const fee = Math.max(FEE_START_SOM, Math.round((base * districtMult * vehicleMult * surge.mult) / 500) * 500);
  const parts = [`${km || 0} km`];
  if (district) parts.push(district);
  parts.push(VEHICLE_LABEL[vehicle]);
  parts.push(surge.label);
  return {
    distanceKm: km,
    fee,
    detail: `${parts.join(" · ")} = ${fee.toLocaleString("uz-UZ")} so'm`,
    surgeLabel: surge.label,
    vehicle,
    district,
  };
}

export function quoteFeeFromDistance(km: number): number {
  return quoteDeliveryFee({ distanceKm: km }).fee;
}

export function quoteDelivery(deliveryFee: number): { commission: number; courierPayout: number } {
  const commission = Math.round((deliveryFee * COMMISSION_PERCENT) / 100);
  return {
    commission,
    courierPayout: deliveryFee - commission,
  };
}

export function quoteErrand(productPrice: number, courierFee: number): {
  productPrice: number;
  courierFee: number;
  commission: number;
  collectFromCustomer: number;
} {
  const { commission } = quoteDelivery(courierFee);
  return {
    productPrice,
    courierFee,
    commission,
    collectFromCustomer: productPrice + courierFee,
  };
}

export const FREE_CANCEL_MS = 60_000;
export const FREE_RELEASE_MS = 60_000;
export const FREE_WAIT_MS = 180_000;
export const WAIT_FEE_PER_MIN = 1000;
export const MAX_WAIT_MINUTES = 12;
export const ARRIVE_RADIUS_KM = 0.15;
export const RELEASE_PENALTY_SOM = 4000;
export const CANCEL_MIN_SOM = 4000;
export const CANCEL_MAX_SOM = 15_000;

export type WaitClock = {
  arrived: boolean;
  frozen: boolean;
  freeLeftSec: number;
  billedMinutes: number;
  fee: number;
  maxed: boolean;
};

export type CancelQuote = {
  allowed: boolean;
  fee: number;
  waitFee: number;
  total: number;
  label: string;
};

export type ReleaseQuote = {
  allowed: boolean;
  penalty: number;
  noShow: boolean;
  label: string;
};

export function formatWaitSec(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function waitClock(input: {
  arrivedAt: number | null;
  freeze?: boolean;
  storedFee?: number | null;
  at?: number;
}): WaitClock {
  if (input.freeze) {
    const fee = Math.max(0, Math.round(input.storedFee ?? 0));
    return {
      arrived: input.arrivedAt != null,
      frozen: true,
      freeLeftSec: 0,
      billedMinutes: WAIT_FEE_PER_MIN > 0 ? Math.round(fee / WAIT_FEE_PER_MIN) : 0,
      fee,
      maxed: fee >= WAIT_FEE_PER_MIN * MAX_WAIT_MINUTES,
    };
  }
  if (input.arrivedAt == null) {
    return { arrived: false, frozen: false, freeLeftSec: 0, billedMinutes: 0, fee: 0, maxed: false };
  }
  const at = input.at ?? Date.now();
  const elapsed = Math.max(0, at - input.arrivedAt);
  const freeLeftSec = Math.max(0, Math.ceil((FREE_WAIT_MS - elapsed) / 1000));
  const billedMs = Math.max(0, elapsed - FREE_WAIT_MS);
  const billedMinutes = billedMs <= 0 ? 0 : Math.min(MAX_WAIT_MINUTES, Math.ceil(billedMs / 60_000));
  return {
    arrived: true,
    frozen: false,
    freeLeftSec,
    billedMinutes,
    fee: billedMinutes * WAIT_FEE_PER_MIN,
    maxed: billedMinutes >= MAX_WAIT_MINUTES,
  };
}

export function quoteCancelFee(feeBase: number, arrived: boolean): number {
  const pct = arrived ? 0.5 : 0.3;
  const raw = Math.round((Math.max(0, feeBase) * pct) / 500) * 500;
  return Math.min(CANCEL_MAX_SOM, Math.max(CANCEL_MIN_SOM, raw));
}

export function quoteCancel(input: {
  status: OrderStatus;
  acceptedAt: number | null;
  arrivedAt: number | null;
  feeBase: number;
  waitFee: number;
  at?: number;
}): CancelQuote {
  const waitFee = Math.max(0, Math.round(input.waitFee));
  if (input.status === "posted") {
    return { allowed: true, fee: 0, waitFee: 0, total: 0, label: t("cancel.free_none") };
  }
  if (input.status === "picked_up" || input.status === "delivered" || input.status === "cancelled") {
    return {
      allowed: false,
      fee: 0,
      waitFee,
      total: 0,
      label: t("cancel.too_late"),
    };
  }
  const at = input.at ?? Date.now();
  const free = input.arrivedAt == null && input.acceptedAt != null && at - input.acceptedAt < FREE_CANCEL_MS;
  if (free) {
    return { allowed: true, fee: 0, waitFee: 0, total: 0, label: t("cancel.free_min") };
  }
  const arrived = input.arrivedAt != null;
  const fee = quoteCancelFee(input.feeBase, arrived);
  return {
    allowed: true,
    fee,
    waitFee,
    total: fee + waitFee,
    label: arrived ? t("cancel.wait") : t("cancel.road"),
  };
}

export function quoteRelease(input: {
  status: OrderStatus;
  acceptedAt: number | null;
  arrivedAt: number | null;
  waitMaxed: boolean;
  at?: number;
}): ReleaseQuote {
  if (input.status !== "accepted") {
    return { allowed: false, penalty: 0, noShow: false, label: t("release.late") };
  }
  if (input.arrivedAt != null && input.waitMaxed) {
    return {
      allowed: true,
      penalty: 0,
      noShow: true,
      label: t("release.noshow"),
    };
  }
  const at = input.at ?? Date.now();
  const free = input.arrivedAt == null && input.acceptedAt != null && at - input.acceptedAt < FREE_RELEASE_MS;
  if (free) {
    return { allowed: true, penalty: 0, noShow: false, label: t("release.free") };
  }
  return {
    allowed: true,
    penalty: RELEASE_PENALTY_SOM,
    noShow: false,
    label: t("release.fee"),
  };
}

export const AD_SLOTS: AdSlot[] = ["kitchen", "street", "market"];

export const AD_SLOT_LABEL: Record<AdSlot, string> = {
  get kitchen() {
    return t("ad.kitchen");
  },
  get street() {
    return t("ad.street");
  },
  get market() {
    return t("ad.market");
  },
};

export const AD_PLANS: AdPlan[] = ["day", "week", "month"];

export const AD_PLAN_LABEL: Record<AdPlan, string> = {
  get day() {
    return t("ad.day");
  },
  get week() {
    return t("ad.week");
  },
  get month() {
    return t("ad.month");
  },
};

export const AD_PLAN_DAYS: Record<AdPlan, number> = {
  day: 1,
  week: 7,
  month: 30,
};

export const AD_PLAN_SOM: Record<AdPlan, number> = {
  day: 15_000,
  week: 80_000,
  month: 250_000,
};

export function asAdPlan(value?: string | null): AdPlan {
  return value === "week" || value === "month" ? value : "day";
}

export function asAdSlot(value?: string | null): AdSlot {
  return value === "street" || value === "market" ? value : "kitchen";
}

export function quoteAd(plan?: AdPlan | null): { plan: AdPlan; fee: number; days: number } {
  const next = asAdPlan(plan);
  return { plan: next, fee: AD_PLAN_SOM[next], days: AD_PLAN_DAYS[next] };
}
