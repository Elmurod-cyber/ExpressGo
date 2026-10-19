type PgPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
};

export type FoodCartLine = { foodId: string; quantity: number };

let pool: PgPool | null = null;
let ready = false;
let reason = "DATABASE_URL yo'q. Taom jadvali ulanmagan. supabase/eg_food.sql tayyor.";

export function foodDatabaseStatus(): { ready: boolean; reason: string } {
  return { ready, reason };
}

function connectionConfig(url: string): { connectionString: string; ssl?: { rejectUnauthorized: boolean } } {
  const needsSsl = /supabase\.(co|com)/i.test(url) || /sslmode=require/i.test(url);
  return needsSsl ? { connectionString: url, ssl: { rejectUnauthorized: false } } : { connectionString: url };
}

export async function connectFoodDatabase(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (!url) {
    ready = false;
    reason = "DATABASE_URL yo'q. Taom jadvali ulanmagan. supabase/eg_food.sql ni keyinroq ishga tushiring. Kalitni ilovaga yozmang.";
    return { ok: false, reason };
  }
  const { Pool } = await import("pg");
  const next = new Pool(connectionConfig(url));
  try {
    const found = await next.query("select to_regclass('public.eg_food_users') as name");
    if (!found.rows[0]?.name) {
      await next.end();
      ready = false;
      reason = "public.eg_food_users jadvali yo'q. supabase/eg_food.sql ni ishga tushiring.";
      return { ok: false, reason };
    }
    const orders = await next.query("select to_regclass('public.eg_food_orders') as name");
    if (!orders.rows[0]?.name) {
      await next.end();
      ready = false;
      reason = "public.eg_food_orders jadvali yo'q. supabase/eg_food.sql ni ishga tushiring.";
      return { ok: false, reason };
    }
    await next.query(
      "alter table public.eg_food_orders add column if not exists updated_at timestamptz not null default timezone('utc', now())",
    );
    await next.query(
      `delete from public.eg_food_orders
       where id in (
         select id from (
           select id, row_number() over (partition by ticket_id order by created_at desc, id desc) as n
           from public.eg_food_orders
         ) ranked
         where ranked.n > 1
       )`,
    );
    await next.query(
      "create unique index if not exists eg_food_orders_ticket_id_uid on public.eg_food_orders (ticket_id)",
    );
    pool = next;
    ready = true;
    reason = "";
    return { ok: true };
  } catch (caught) {
    await next.end().catch(() => undefined);
    ready = false;
    const detail = caught instanceof Error ? caught.message : "ulanmadi";
    reason = `Taom bazasi ulanmadi: ${detail}. DATABASE_URL serverda bo'lsin, ilovada emas.`;
    return { ok: false, reason };
  }
}

async function userId(phone: string, name: string, address?: string): Promise<string | null> {
  if (!pool) return null;
  const saved = await pool.query(
    `insert into public.eg_food_users (phone_number, full_name, address)
     values ($1, $2, $3)
     on conflict (phone_number) do update
       set full_name = excluded.full_name,
           address = coalesce(excluded.address, public.eg_food_users.address)
     returning id`,
    [phone, name, address ?? null],
  );
  const id = saved.rows[0]?.id;
  return typeof id === "string" ? id : null;
}

export async function saveFoodUserRow(phone: string, name: string): Promise<void> {
  if (!pool) return;
  await userId(phone, name);
}

export async function saveFoodCartRows(phone: string, name: string, restaurantId: string, lines: FoodCartLine[]): Promise<void> {
  if (!pool || !restaurantId) return;
  const id = await userId(phone, name);
  if (!id) return;
  await pool.query("delete from public.eg_food_cart where user_id = $1 and restaurant_id = $2", [id, restaurantId]);
  for (const line of lines) {
    await pool.query(
      `insert into public.eg_food_cart (user_id, food_id, quantity, restaurant_id)
       values ($1, $2, $3, $4)
       on conflict (user_id, restaurant_id, food_id) do update set quantity = excluded.quantity`,
      [id, line.foodId, line.quantity, restaurantId],
    );
  }
}

export async function saveFoodOrderRow(input: {
  phone: string;
  name: string;
  restaurantId: string;
  ticketId: string;
  address: string;
  body: Record<string, unknown>;
}): Promise<void> {
  if (!pool) return;
  const id = await userId(input.phone, input.name, input.address);
  if (!id) return;
  await pool.query(
    `insert into public.eg_food_orders (user_id, restaurant_id, ticket_id, body, updated_at)
     values ($1, $2, $3, $4::jsonb, timezone('utc', now()))
     on conflict (ticket_id) do update set
       user_id = excluded.user_id,
       restaurant_id = excluded.restaurant_id,
       body = excluded.body,
       updated_at = timezone('utc', now())`,
    [id, input.restaurantId, input.ticketId, JSON.stringify(input.body)],
  );
}

export type FoodOrderLoad = {
  ticketId: string;
  restaurantId: string;
  phone: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  body: Record<string, unknown>;
};

/** Ochiq buyurtmalar va oxirgi 12 soatda tugaganlari. maxSeq barcha qatorlardan. */
export async function listFoodOrdersForBoot(): Promise<{ orders: FoodOrderLoad[]; maxSeq: number }> {
  if (!pool) return { orders: [], maxSeq: 0 };
  const max = await pool.query(
    "select coalesce(max((regexp_match(ticket_id, '^f([0-9]+)$'))[1]::bigint), 0) as n from public.eg_food_orders",
  );
  const rawMax = max.rows[0]?.n;
  const maxSeq = typeof rawMax === "number" ? rawMax : Number(rawMax ?? 0);
  const result = await pool.query(
    `select o.ticket_id, o.restaurant_id, o.body, u.phone_number, u.full_name,
            extract(epoch from o.created_at) * 1000 as created_ms,
            extract(epoch from o.updated_at) * 1000 as updated_ms
     from public.eg_food_orders o
     join public.eg_food_users u on u.id = o.user_id
     where coalesce(o.body->>'status', 'new') in ('new', 'accepted', 'preparing', 'ready')
        or o.updated_at > timezone('utc', now()) - interval '12 hours'`,
  );
  const orders: FoodOrderLoad[] = [];
  for (const row of result.rows) {
    const body = row.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) continue;
    const ticketId = typeof row.ticket_id === "string" ? row.ticket_id : "";
    const restaurantId = typeof row.restaurant_id === "string" ? row.restaurant_id : "";
    if (!ticketId || !restaurantId) continue;
    orders.push({
      ticketId,
      restaurantId,
      phone: typeof row.phone_number === "string" ? row.phone_number : "",
      name: typeof row.full_name === "string" ? row.full_name : "",
      createdAt: Number(row.created_ms) || Date.now(),
      updatedAt: Number(row.updated_ms) || Date.now(),
      body: body as Record<string, unknown>,
    });
  }
  return { orders, maxSeq: Number.isFinite(maxSeq) ? maxSeq : 0 };
}
