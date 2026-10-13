import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  closeBuilder,
  listBuilders,
  listMyBuilders,
  postBuilder,
  registerMaster,
  rememberMasterSubscription,
  requestGuestCode,
  startMasterSub,
  verifyGuestCode,
} from "./store";
import { readDevOtp } from "./sms";
import { constructionDatabaseStatus } from "./constructionDb";
import { MASTER_SUB_DAYS, MASTER_SUB_PRICE } from "./rules";

const employer = "998900000011";
const master = "998900000055";

test("qurilish jadvallari anonim mijozga yopiq", () => {
  const sql = readFileSync(new URL("../../supabase/construction.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.construction_jobs/);
  assert.match(sql, /create table if not exists public\.master_subscriptions/);
  assert.match(sql, /phone_number text not null/);
  assert.match(sql, /master_phone text not null unique/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /revoke all on table public\.construction_jobs from anon/);
  assert.match(sql, /revoke all on table public\.master_subscriptions from authenticated/);
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /grant /i);
});

test("qurilish bazasi ulanmagan deb qoladi", () => {
  const status = constructionDatabaseStatus();
  assert.equal(status.ready, false);
  assert.match(status.reason, /DATABASE_URL/);
});

test("obunasiz usta telefon va manzilni ko'rmaydi, egasi ko'radi", async () => {
  process.env.EG_OTP_DEV = "1";
  await requestGuestCode("employer", employer);
  const code = readDevOtp(employer);
  if (!code) throw new Error("Kod saqlanmadi.");
  const pass = await verifyGuestCode("employer", employer, code, "Karim");
  const street = "Bog ko'cha 12";
  const card = await postBuilder({
    kind: "job",
    name: "Karim",
    phone: employer,
    guestToken: pass.token,
    trade: "plumb",
    region: "Andijon",
    area: "Shahrixon",
    address: street,
    text: "Santexnik kerak, 3 kunlik ish.",
    payKind: "deal",
    term: "day",
    workers: 1,
  });

  const hidden = await listBuilders("job", master);
  const row = hidden.find((item) => item.id === card.id);
  assert.ok(row);
  assert.equal(row.contactOpen, false);
  assert.equal(row.phone, "+998 90 *** ** 11");
  assert.equal(row.address, "");
  assert.equal(row.area, "Shahrixon");

  const mine = await listMyBuilders(employer, "job", pass.token);
  const own = mine.find((item) => item.id === card.id);
  assert.ok(own);
  assert.equal(own.contactOpen, true);
  assert.equal(own.address, street);
  assert.match(own.phone, /11$/);

  rememberMasterSubscription(master, Date.now() + 7 * 24 * 60 * 60 * 1000);
  const open = await listBuilders("job", master);
  const shown = open.find((item) => item.id === card.id);
  assert.ok(shown);
  assert.equal(shown.contactOpen, true);
  assert.equal(shown.address, street);
  assert.match(shown.phone, /11$/);

  await closeBuilder(card.id, employer, pass.token);
  const board = await listBuilders("job", master);
  assert.equal(board.some((item) => item.id === card.id), false);
  const history = await listMyBuilders(employer, "job", pass.token);
  const closed = history.find((item) => item.id === card.id);
  assert.equal(closed?.status, "filled");
  assert.equal(closed?.contactOpen, true);
});

test("usta bir oy bepul, keyin obunasiz manzil va telefon yopiq", async () => {
  const phone = "998900000066";
  const first = await registerMaster("Jasur", phone);
  assert.equal(first.active, true);
  assert.equal(first.price, MASTER_SUB_PRICE);
  assert.equal(first.days, MASTER_SUB_DAYS);
  const again = await registerMaster("Jasur", "+998 90 000 00 66");
  assert.equal(again.until, first.until);

  process.env.EG_OTP_DEV = "1";
  await requestGuestCode("employer", "998900000077");
  const code = readDevOtp("998900000077");
  if (!code) throw new Error("Kod saqlanmadi.");
  const pass = await verifyGuestCode("employer", "998900000077", code, "Olim");
  const street = "Yangi ko'cha 4";
  const card = await postBuilder({
    kind: "job",
    name: "Olim",
    phone: "998900000077",
    guestToken: pass.token,
    trade: "electric",
    region: "Andijon",
    area: "Shahrixon",
    address: street,
    text: `Elektrik kerak, ${street}, 2 kunlik ish.`,
    payKind: "deal",
    term: "day",
    workers: 1,
  });

  const open = await listBuilders("job", phone);
  const shown = open.find((item) => item.id === card.id);
  assert.ok(shown);
  assert.equal(shown.contactOpen, true);
  assert.equal(shown.address, street);

  rememberMasterSubscription(phone, Date.now() - 1000);
  const hidden = await listBuilders("job", phone);
  const locked = hidden.find((item) => item.id === card.id);
  assert.ok(locked);
  assert.equal(locked.contactOpen, false);
  assert.equal(locked.address, "");
  assert.equal(locked.text.includes(street), false);
  assert.equal(locked.phone.includes("998900000077"), false);
  assert.match(locked.phone, /\*\*/);

  const renewed = await startMasterSub(phone);
  assert.equal(renewed.active, true);
  assert.equal(renewed.price, MASTER_SUB_PRICE);
  const after = await listBuilders("job", phone);
  const unlocked = after.find((item) => item.id === card.id);
  assert.equal(unlocked?.contactOpen, true);
  assert.equal(unlocked?.address, street);
  await assert.rejects(startMasterSub("998900000088"));
});
