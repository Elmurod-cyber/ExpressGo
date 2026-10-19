import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { DocStatus, LedgerEntry, OrderStatus, Role, VehicleKind } from "../types";

export type OtpRow = {
  phone: string;
  role: Role;
  codeHash: string;
  expiresAt: number;
  tries: number;
};

export type SessionRow = {
  tokenHash: string;
  userId: string;
  expiresAt: number;
};

export type DeliveryUser = {
  id: string;
  phone: string;
  role: Role;
  isAdmin: boolean;
  name: string;
  photo?: string | null;
  balance: number;
  vehicle: VehicleKind | null;
  shiftOn: boolean;
  shiftStartedAt: number | null;
  lat: number | null;
  lng: number | null;
  locationAt: number | null;
  phoneVerified: boolean;
  pushToken: string | null;
  passportUri: string | null;
  licenseUri: string | null;
  vehicleDocUri: string | null;
  passportStatus: DocStatus;
  licenseStatus: DocStatus;
  vehicleStatus: DocStatus;
  passportNote: string | null;
  licenseNote: string | null;
  vehicleNote: string | null;
  ledger: LedgerEntry[];
  createdAt: number;
  updatedAt: number;
};

export type DeliveryOrder = {
  id: string;
  senderId: string;
  courierId: string | null;
  pickup: string;
  dropoff: string;
  item: string;
  customerName: string;
  customerPhone: string;
  note: string;
  deliveryFee: number;
  commission: number;
  courierPayout: number;
  status: OrderStatus;
  vehicle: VehicleKind;
  readyAt: number;
  postedAt: number;
  acceptedAt: number | null;
  arrivedAt: number | null;
  pickedUpAt: number | null;
  deliveredAt: number | null;
  cancelledAt: number | null;
  commissionCharged: boolean;
  declinedBy: string[];
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  version: number;
  updatedAt: number;
};

export type AddressUse = {
  key: string;
  label: string;
  lat: number | null;
  lng: number | null;
  uses: number;
};

export type DeliveryRepository = {
  readUser(id: string): Promise<DeliveryUser | null>;
  readUserByPhone(phone: string, role: Role): Promise<DeliveryUser | null>;
  writeUser(user: DeliveryUser): Promise<void>;
  listUsers(): Promise<DeliveryUser[]>;
  readOtp(phone: string, role: Role): Promise<OtpRow | null>;
  writeOtp(row: OtpRow): Promise<void>;
  deleteOtp(phone: string, role: Role): Promise<void>;
  writeSession(row: SessionRow): Promise<void>;
  readSession(tokenHash: string): Promise<SessionRow | null>;
  deleteSession(tokenHash: string): Promise<void>;
  readOrder(id: string): Promise<DeliveryOrder | null>;
  listOrders(): Promise<DeliveryOrder[]>;
  insertOrder(order: DeliveryOrder): Promise<void>;
  claimPosted(id: string, courierId: string, at: number): Promise<DeliveryOrder | null>;
  saveOrderIf(expectedStatus: OrderStatus, order: DeliveryOrder): Promise<DeliveryOrder | null>;
  bumpAddressUse(row: { key: string; label: string; lat: number | null; lng: number | null }): Promise<void>;
  listAddressUses(limit: number): Promise<AddressUse[]>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
};

type FileData = {
  users: DeliveryUser[];
  orders: DeliveryOrder[];
  otps: OtpRow[];
  sessions: SessionRow[];
  addresses: AddressUse[];
};

function emptyData(): FileData {
  return { users: [], orders: [], otps: [], sessions: [], addresses: [] };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createFileDeliveryRepository(file: string): DeliveryRepository {
  const data: FileData = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as FileData)
    : emptyData();
  data.users ??= [];
  data.orders ??= [];
  data.otps ??= [];
  data.sessions ??= [];
  data.addresses ??= [];
  let tail: Promise<void> = Promise.resolve();
  let depth = 0;

  function flush() {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data));
  }

  async function gate<T>(work: () => Promise<T> | T): Promise<T> {
    if (depth > 0) return work();
    const run = tail.then(async () => {
      depth += 1;
      try {
        return await work();
      } finally {
        depth -= 1;
        flush();
      }
    });
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  const repo: DeliveryRepository = {
    async readUser(id) {
      return gate(() => clone(data.users.find((item) => item.id === id) ?? null));
    },
    async readUserByPhone(phone, role) {
      return gate(() => clone(data.users.find((item) => item.phone === phone && item.role === role) ?? null));
    },
    async writeUser(user) {
      await gate(() => {
        const index = data.users.findIndex((item) => item.id === user.id);
        if (index < 0) data.users.push(clone(user));
        else data.users[index] = clone(user);
      });
    },
    async listUsers() {
      return gate(() => clone(data.users));
    },
    async readOtp(phone, role) {
      return gate(() => clone(data.otps.find((item) => item.phone === phone && item.role === role) ?? null));
    },
    async writeOtp(row) {
      await gate(() => {
        const index = data.otps.findIndex((item) => item.phone === row.phone && item.role === row.role);
        if (index < 0) data.otps.push(clone(row));
        else data.otps[index] = clone(row);
      });
    },
    async deleteOtp(phone, role) {
      await gate(() => {
        const index = data.otps.findIndex((item) => item.phone === phone && item.role === role);
        if (index >= 0) data.otps.splice(index, 1);
      });
    },
    async writeSession(row) {
      await gate(() => {
        const index = data.sessions.findIndex((item) => item.tokenHash === row.tokenHash);
        if (index < 0) data.sessions.push(clone(row));
        else data.sessions[index] = clone(row);
      });
    },
    async readSession(tokenHash) {
      return gate(() => clone(data.sessions.find((item) => item.tokenHash === tokenHash) ?? null));
    },
    async deleteSession(tokenHash) {
      await gate(() => {
        const index = data.sessions.findIndex((item) => item.tokenHash === tokenHash);
        if (index >= 0) data.sessions.splice(index, 1);
      });
    },
    async readOrder(id) {
      return gate(() => clone(data.orders.find((item) => item.id === id) ?? null));
    },
    async listOrders() {
      return gate(() => clone(data.orders));
    },
    async insertOrder(order) {
      await gate(() => {
        data.orders.unshift(clone(order));
      });
    },
    async claimPosted(id, courierId, at) {
      return gate(() => {
        const order = data.orders.find((item) => item.id === id);
        if (!order || order.status !== "posted" || order.courierId) return null;
        order.status = "accepted";
        order.courierId = courierId;
        order.acceptedAt = at;
        order.version += 1;
        order.updatedAt = at;
        return clone(order);
      });
    },
    async saveOrderIf(expectedStatus, order) {
      return gate(() => {
        const current = data.orders.find((item) => item.id === order.id);
        if (!current || current.status !== expectedStatus || current.version !== order.version - 1) return null;
        const index = data.orders.findIndex((item) => item.id === order.id);
        data.orders[index] = clone(order);
        return clone(order);
      });
    },
    async bumpAddressUse(row) {
      await gate(() => {
        const found = data.addresses.find((item) => item.key === row.key);
        if (found) {
          found.uses += 1;
          found.label = row.label;
          if (row.lat != null && row.lng != null) {
            found.lat = row.lat;
            found.lng = row.lng;
          }
          return;
        }
        data.addresses.push({ ...row, uses: 1 });
      });
    },
    async listAddressUses(limit) {
      return gate(() =>
        clone(data.addresses)
          .sort((a, b) => b.uses - a.uses)
          .slice(0, limit),
      );
    },
    transaction(work) {
      return gate(work);
    },
  };
  return repo;
}
