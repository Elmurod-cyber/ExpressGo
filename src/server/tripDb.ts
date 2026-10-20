import type { StoredDriverPass, StoredTrip, TripRepository } from "./store";

type PgPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
};

let pool: PgPool | null = null;
let ready = false;
let reason = "DATABASE_URL yo'q. PostgreSQL ulanmagan. supabase/eg_trip_ads.sql tayyor, lekin baza hali sozlanmagan.";

export function tripDatabaseStatus(): { ready: boolean; reason: string } {
  return { ready, reason };
}

function connectionConfig(url: string): { connectionString: string; ssl?: { rejectUnauthorized: boolean } } {
  const needsSsl = /supabase\.(co|com)/i.test(url) || /sslmode=require/i.test(url);
  return needsSsl ? { connectionString: url, ssl: { rejectUnauthorized: false } } : { connectionString: url };
}

function asTrip(row: Record<string, unknown>): StoredTrip {
  const lat = (value: unknown) => (value == null || value === "" ? null : Number(value));
  return {
    id: String(row.id),
    phone: String(row.owner_phone),
    offer: row.offer === "driver" ? "driver" : "rider",
    passengerName: String(row.passenger_name),
    from: String(row.from_place),
    to: String(row.to_place),
    fromLat: lat(row.from_lat),
    fromLng: lat(row.from_lng),
    toLat: lat(row.to_lat),
    toLng: lat(row.to_lng),
    whenLabel: String(row.when_label),
    seats: Number(row.seats),
    price: Number(row.price),
    note: String(row.note ?? ""),
    vehicle: String(row.vehicle ?? ""),
    photo: typeof row.photo === "string" && row.photo.startsWith("data:image/") ? row.photo : null,
    at: Number(row.created_at),
  };
}

export async function connectTripDatabase(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (!url) {
    ready = false;
    reason = "DATABASE_URL yo'q. PostgreSQL ulanmagan. supabase/eg_trip_ads.sql ni keyinroq ishga tushiring. Kalitni ilovaga yozmang.";
    return { ok: false, reason };
  }
  const { Pool } = await import("pg");
  const next = new Pool(connectionConfig(url));
  try {
    const found = await next.query("select to_regclass('public.eg_trip_ads') as name");
    if (!found.rows[0]?.name) {
      await next.end();
      ready = false;
      reason = "public.eg_trip_ads jadvali yo'q. supabase/eg_trip_ads.sql ni SQL Editor da ishga tushiring.";
      return { ok: false, reason };
    }
    await next.query("alter table public.eg_trip_ads add column if not exists offer text not null default 'rider'");
    await next.query("alter table public.eg_trip_ads add column if not exists vehicle text not null default ''");
    await next.query("alter table public.eg_trip_ads add column if not exists photo text not null default ''");
    await next.query(
      `create table if not exists public.eg_driver_passes (
         phone text primary key,
         driver_id text not null,
         expires_at bigint not null
       )`,
    );
    await next.query("alter table public.eg_driver_passes enable row level security");
    await next.query("alter table public.eg_driver_passes force row level security");
    await next.query("revoke all on table public.eg_driver_passes from public");
    await next.query("revoke all on table public.eg_driver_passes from anon");
    await next.query("revoke all on table public.eg_driver_passes from authenticated");
    pool = next;
    ready = true;
    reason = "";
    return { ok: true };
  } catch (caught) {
    await next.end().catch(() => undefined);
    ready = false;
    const detail = caught instanceof Error ? caught.message : "ulanmadi";
    reason = `PostgreSQL ulanmadi: ${detail}. DATABASE_URL serverda bo'lsin, ilovada emas.`;
    return { ok: false, reason };
  }
}

export function tripRepository(): TripRepository {
  return {
    async list() {
      if (!pool) return [];
      const result = await pool.query(
        `select id, owner_phone, passenger_name, from_place, to_place, from_lat, from_lng, to_lat, to_lng,
                when_label, seats, price, note, created_at, offer, vehicle, photo
         from public.eg_trip_ads
         order by created_at desc`,
      );
      return result.rows.map(asTrip);
    },
    async upsert(row) {
      if (!pool) throw new Error("PostgreSQL ulanmagan.");
      await pool.query(
        `insert into public.eg_trip_ads (
           id, owner_phone, passenger_name, from_place, to_place, from_lat, from_lng, to_lat, to_lng,
           when_label, seats, price, note, created_at, offer, vehicle, photo
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         on conflict (id) do update set
           owner_phone = excluded.owner_phone,
           offer = excluded.offer,
           passenger_name = excluded.passenger_name,
           from_place = excluded.from_place,
           to_place = excluded.to_place,
           from_lat = excluded.from_lat,
           from_lng = excluded.from_lng,
           to_lat = excluded.to_lat,
           to_lng = excluded.to_lng,
           when_label = excluded.when_label,
           seats = excluded.seats,
           price = excluded.price,
           note = excluded.note,
           vehicle = excluded.vehicle,
           photo = excluded.photo,
           created_at = excluded.created_at`,
        [
          row.id,
          row.phone,
          row.passengerName,
          row.from,
          row.to,
          row.fromLat,
          row.fromLng,
          row.toLat,
          row.toLng,
          row.whenLabel,
          row.seats,
          row.price,
          row.note,
          row.at,
          row.offer === "driver" ? "driver" : "rider",
          row.vehicle ?? "",
          row.photo ?? "",
        ],
      );
    },
    async remove(id) {
      if (!pool) throw new Error("PostgreSQL ulanmagan.");
      await pool.query("delete from public.eg_trip_ads where id = $1", [id]);
    },
    async listPasses() {
      if (!pool) return [];
      const result = await pool.query("select phone, driver_id, expires_at from public.eg_driver_passes");
      return result.rows.map(asPass);
    },
    async grantPass(row) {
      if (!pool) return row;
      const result = await pool.query(
        `insert into public.eg_driver_passes (phone, driver_id, expires_at)
         values ($1, $2, $3)
         on conflict (phone) do update set driver_id = excluded.driver_id
         returning phone, driver_id, expires_at`,
        [row.phone, row.driverId, row.until],
      );
      return asPass(result.rows[0] ?? { phone: row.phone, driver_id: row.driverId, expires_at: row.until });
    },
    async renewPass(row) {
      if (!pool) return;
      await pool.query(
        `insert into public.eg_driver_passes (phone, driver_id, expires_at)
         values ($1, $2, $3)
         on conflict (phone) do update set driver_id = excluded.driver_id, expires_at = excluded.expires_at`,
        [row.phone, row.driverId, row.until],
      );
    },
  };
}

function asPass(row: Record<string, unknown>): StoredDriverPass {
  return {
    phone: String(row.phone),
    driverId: String(row.driver_id ?? ""),
    until: Number(row.expires_at),
  };
}
