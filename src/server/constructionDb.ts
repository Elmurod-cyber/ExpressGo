import type { ConstructionRepository, StoredConstructionJob } from "./store";

type PgPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
};

let pool: PgPool | null = null;
let ready = false;
let reason = "DATABASE_URL yo'q. PostgreSQL ulanmagan. supabase/construction.sql tayyor, lekin baza hali sozlanmagan.";

export function constructionDatabaseStatus(): { ready: boolean; reason: string } {
  return { ready, reason };
}

function connectionConfig(url: string): { connectionString: string; ssl?: { rejectUnauthorized: boolean } } {
  const needsSsl = /supabase\.(co|com)/i.test(url) || /sslmode=require/i.test(url);
  return needsSsl ? { connectionString: url, ssl: { rejectUnauthorized: false } } : { connectionString: url };
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function asJob(row: Record<string, unknown>): StoredConstructionJob {
  const images = Array.isArray(row.images) ? row.images.map((item) => String(item)) : [];
  const created = row.created_at instanceof Date ? row.created_at.getTime() : Date.parse(text(row.created_at));
  const price = row.price == null || row.price === "" ? null : Number(row.price);
  const pay = text(row.pay_kind);
  const term = text(row.term);
  return {
    id: text(row.id),
    name: text(row.title),
    phone: text(row.phone_number),
    trade: text(row.category),
    region: text(row.region),
    area: text(row.area) || text(row.district),
    address: text(row.address),
    text: text(row.description),
    photo: images[0] ?? null,
    price: price != null && Number.isFinite(price) ? price : null,
    payKind: pay === "deal" || pay === "fixed" ? pay : "",
    term: term === "day" || term === "temp" || term === "steady" ? term : "",
    workers: Number(row.workers) || 0,
    status: text(row.status) === "filled" ? "filled" : "active",
    at: Number.isFinite(created) ? created : Date.now(),
  };
}

export async function connectConstructionDatabase(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (!url) {
    ready = false;
    reason = "DATABASE_URL yo'q. PostgreSQL ulanmagan. supabase/construction.sql ni keyinroq ishga tushiring. Kalitni ilovaga yozmang.";
    return { ok: false, reason };
  }
  const { Pool } = await import("pg");
  const next = new Pool(connectionConfig(url));
  try {
    const found = await next.query("select to_regclass('public.construction_jobs') as jobs, to_regclass('public.master_subscriptions') as subs");
    if (!found.rows[0]?.jobs || !found.rows[0]?.subs) {
      await next.end();
      ready = false;
      reason = "construction_jobs yoki master_subscriptions yo'q. supabase/construction.sql ni SQL Editor da ishga tushiring.";
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
    reason = detail.includes("://")
      ? "PostgreSQL ulanmadi. DATABASE_URL serverda bo'lsin, ilovada emas."
      : `PostgreSQL ulanmadi: ${detail}. DATABASE_URL serverda bo'lsin, ilovada emas.`;
    return { ok: false, reason };
  }
}

export function constructionRepository(): ConstructionRepository {
  return {
    async listJobs() {
      if (!pool) return [];
      const result = await pool.query(
        `select id, title, description, category, district, address, phone_number, images, status, created_at,
                region, area, price, pay_kind, term, workers
         from public.construction_jobs
         order by created_at desc`,
      );
      return result.rows.map(asJob);
    },
    async upsertJob(row) {
      if (!pool) throw new Error("PostgreSQL ulanmagan.");
      await pool.query(
        `insert into public.construction_jobs (
           id, title, description, category, district, address, phone_number, images, status, created_at,
           region, area, price, pay_kind, term, workers
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         on conflict (id) do update set
           title = excluded.title,
           description = excluded.description,
           category = excluded.category,
           district = excluded.district,
           address = excluded.address,
           phone_number = excluded.phone_number,
           images = excluded.images,
           status = excluded.status,
           region = excluded.region,
           area = excluded.area,
           price = excluded.price,
           pay_kind = excluded.pay_kind,
           term = excluded.term,
           workers = excluded.workers`,
        [
          row.id,
          row.name,
          row.text,
          row.trade,
          row.area || row.region || "Shahrixon",
          row.address,
          row.phone,
          row.photo ? [row.photo] : [],
          row.status,
          new Date(row.at).toISOString(),
          row.region,
          row.area,
          row.price,
          row.payKind,
          row.term,
          row.workers,
        ],
      );
    },
    async removeJob(id) {
      if (!pool) throw new Error("PostgreSQL ulanmagan.");
      await pool.query("delete from public.construction_jobs where id = $1", [id]);
    },
    async subscriptionUntil(phone) {
      if (!pool) return null;
      const digits = phone.replace(/\D/g, "").slice(-9);
      if (digits.length < 9) return null;
      const result = await pool.query(
        `select floor(extract(epoch from expires_at) * 1000) as until
         from public.master_subscriptions
         where right(regexp_replace(master_phone, '\\D', '', 'g'), 9) = $1
           and is_active = true
           and expires_at > now()
         limit 1`,
        [digits],
      );
      const until = Number(result.rows[0]?.until);
      return Number.isFinite(until) ? until : null;
    },
  };
}
