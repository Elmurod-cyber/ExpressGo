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
    `insert into public.eg_food_orders (user_id, restaurant_id, ticket_id, body)
     values ($1, $2, $3, $4::jsonb)`,
    [id, input.restaurantId, input.ticketId, JSON.stringify(input.body)],
  );
}
