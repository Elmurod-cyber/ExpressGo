import type { StoredTrip, TripRepository } from "./store";

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
                when_label, seats, price, note, created_at
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
           when_label, seats, price, note, created_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         on conflict (id) do update set
           owner_phone = excluded.owner_phone,
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
        ],
      );
    },
    async remove(id) {
      if (!pool) throw new Error("PostgreSQL ulanmagan.");
      await pool.query("delete from public.eg_trip_ads where id = $1", [id]);
    },
  };
}
