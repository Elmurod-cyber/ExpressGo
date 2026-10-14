import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OrderStatus, Role } from "../types";
import type { DeliveryOrder, DeliveryRepository, DeliveryUser, OtpRow, SessionRow } from "./deliveryRepo";
import { markDeliveryDatabaseReady, setDeliveryDatabaseReason, useDeliveryRepository } from "./deliveryService";

type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

type PgPool = Queryable & {
  connect: () => Promise<Queryable & { release: () => void }>;
  end: () => Promise<void>;
};

function connectionConfig(url: string): { connectionString: string; ssl?: { rejectUnauthorized: boolean } } {
  const needsSsl = /supabase\.(co|com)/i.test(url) || /sslmode=require/i.test(url);
  return needsSsl ? { connectionString: url, ssl: { rejectUnauthorized: false } } : { connectionString: url };
}

function asUser(body: unknown, isAdmin: boolean, pushToken: unknown): DeliveryUser {
  const user = body as DeliveryUser;
  user.isAdmin = isAdmin;
  user.ledger ??= [];
  if (typeof pushToken === "string" && pushToken.trim()) user.pushToken = pushToken.trim();
  return user;
}

function asOrder(body: unknown): DeliveryOrder {
  return body as DeliveryOrder;
}

class PgDeliveryRepository implements DeliveryRepository {
  private tx: Queryable | null = null;

  constructor(private pool: PgPool) {}

  private db(): Queryable {
    return this.tx ?? this.pool;
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.tx) return work();
    const client = await this.pool.connect();
    this.tx = client;
    try {
      await client.query("begin");
      const result = await work();
      await client.query("commit");
      return result;
    } catch (caught) {
      await client.query("rollback");
      throw caught;
    } finally {
      this.tx = null;
      client.release();
    }
  }

  async readUser(id: string): Promise<DeliveryUser | null> {
    const result = await this.db().query(
      "select body, is_admin, push_token from public.eg_delivery_users where id = $1",
      [id],
    );
    const row = result.rows[0];
    return row ? asUser(row.body, row.is_admin === true, row.push_token) : null;
  }

  async readUserByPhone(phone: string, role: Role): Promise<DeliveryUser | null> {
    const result = await this.db().query(
      "select body, is_admin, push_token from public.eg_delivery_users where phone = $1 and role = $2",
      [phone, role],
    );
    const row = result.rows[0];
    return row ? asUser(row.body, row.is_admin === true, row.push_token) : null;
  }

  async writeUser(user: DeliveryUser): Promise<void> {
    await this.db().query(
      `insert into public.eg_delivery_users (id, phone, role, is_admin, body, push_token)
       values ($1, $2, $3, $4, $5::jsonb, $6)
       on conflict (id) do update set phone = $2, role = $3, is_admin = $4, body = $5::jsonb, push_token = $6`,
      [user.id, user.phone, user.role, user.isAdmin, JSON.stringify(user), user.pushToken?.trim() || null],
    );
  }

  async listUsers(): Promise<DeliveryUser[]> {
    const result = await this.db().query("select body, is_admin, push_token from public.eg_delivery_users");
    return result.rows.map((row) => asUser(row.body, row.is_admin === true, row.push_token));
  }

  async readOtp(phone: string, role: Role): Promise<OtpRow | null> {
    const result = await this.db().query(
      "select phone, role, code_hash, expires_at, tries from public.eg_delivery_otps where phone = $1 and role = $2",
      [phone, role],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      phone: String(row.phone),
      role: row.role as Role,
      codeHash: String(row.code_hash),
      expiresAt: Number(row.expires_at),
      tries: Number(row.tries),
    };
  }

  async writeOtp(row: OtpRow): Promise<void> {
    await this.db().query(
      `insert into public.eg_delivery_otps (phone, role, code_hash, expires_at, tries)
       values ($1, $2, $3, $4, $5)
       on conflict (phone, role) do update set code_hash = $3, expires_at = $4, tries = $5`,
      [row.phone, row.role, row.codeHash, row.expiresAt, row.tries],
    );
  }

  async deleteOtp(phone: string, role: Role): Promise<void> {
    await this.db().query("delete from public.eg_delivery_otps where phone = $1 and role = $2", [phone, role]);
  }

  async writeSession(row: SessionRow): Promise<void> {
    await this.db().query(
      `insert into public.eg_delivery_sessions (token_hash, user_id, expires_at)
       values ($1, $2, $3)
       on conflict (token_hash) do update set user_id = $2, expires_at = $3`,
      [row.tokenHash, row.userId, row.expiresAt],
    );
  }

  async readSession(tokenHash: string): Promise<SessionRow | null> {
    const result = await this.db().query(
      "select token_hash, user_id, expires_at from public.eg_delivery_sessions where token_hash = $1",
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { tokenHash: String(row.token_hash), userId: String(row.user_id), expiresAt: Number(row.expires_at) };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db().query("delete from public.eg_delivery_sessions where token_hash = $1", [tokenHash]);
  }

  async readOrder(id: string): Promise<DeliveryOrder | null> {
    const result = await this.db().query("select body from public.eg_delivery_orders where id = $1", [id]);
    const row = result.rows[0];
    return row ? asOrder(row.body) : null;
  }

  async listOrders(): Promise<DeliveryOrder[]> {
    const result = await this.db().query("select body from public.eg_delivery_orders order by (body->>'postedAt')::bigint desc");
    return result.rows.map((row) => asOrder(row.body));
  }

  async insertOrder(order: DeliveryOrder): Promise<void> {
    await this.db().query(
      `insert into public.eg_delivery_orders (id, sender_id, courier_id, status, version, body)
       values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [order.id, order.senderId, order.courierId, order.status, order.version, JSON.stringify(order)],
    );
  }

  async claimPosted(id: string, courierId: string, at: number): Promise<DeliveryOrder | null> {
    const current = await this.readOrder(id);
    if (!current || current.status !== "posted" || current.courierId) return null;
    const next: DeliveryOrder = {
      ...current,
      status: "accepted",
      courierId,
      acceptedAt: at,
      version: current.version + 1,
      updatedAt: at,
    };
    const result = await this.db().query(
      `update public.eg_delivery_orders
       set status = 'accepted', courier_id = $2, version = version + 1, body = $3::jsonb
       where id = $1 and status = 'posted' and courier_id is null
       returning body`,
      [id, courierId, JSON.stringify(next)],
    );
    const row = result.rows[0];
    return row ? asOrder(row.body) : null;
  }

  async saveOrderIf(expectedStatus: OrderStatus, order: DeliveryOrder): Promise<DeliveryOrder | null> {
    const result = await this.db().query(
      `update public.eg_delivery_orders
       set status = $4, courier_id = $5, version = version + 1, body = $3::jsonb
       where id = $1 and status = $2 and version = $6
       returning body`,
      [
        order.id,
        expectedStatus,
        JSON.stringify(order),
        order.status,
        order.courierId,
        order.version - 1,
      ],
    );
    const row = result.rows[0];
    return row ? asOrder(row.body) : null;
  }
}

function schemaSql(): string {
  return readFileSync(join(process.cwd(), "supabase", "eg_delivery.sql"), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

export async function connectDeliveryDatabase(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (!url) {
    useDeliveryRepository(null, false);
    const reason = "DATABASE_URL yo'q. Yetkazib berish buyurtmalari PostgreSQL da saqlanmaydi. Kalitni ilovaga yozmang.";
    setDeliveryDatabaseReason(reason);
    return { ok: false, reason };
  }
  const { Pool } = await import("pg");
  const pool = new Pool(connectionConfig(url)) as PgPool;
  try {
    const cleaned = schemaSql();
    const statements = cleaned
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await pool.query(statement);
    }
    useDeliveryRepository(new PgDeliveryRepository(pool), true);
    markDeliveryDatabaseReady();
    return { ok: true };
  } catch (caught) {
    await pool.end().catch(() => undefined);
    useDeliveryRepository(null, false);
    const detail = caught instanceof Error ? caught.message : "ulanmadi";
    const reason = `Yetkazib berish bazasi ulanmadi: ${detail}. DATABASE_URL serverda bo'lsin, ilovada emas.`;
    setDeliveryDatabaseReason(reason);
    return { ok: false, reason };
  }
}
