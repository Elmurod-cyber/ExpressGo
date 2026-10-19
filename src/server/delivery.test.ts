import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Actor } from "./actorContext";
import { createRpcServer } from "./rpcHttp";
import { createFileDeliveryRepository } from "./deliveryRepo";
import {
  acceptDelivery,
  attachLoginChat,
  authMethod,
  beginPasswordReset,
  beginTelegramSignup,
  confirmLoginContact,
  finishPasswordReset,
  finishTelegramSignup,
  loginWithPassword,
  adminBoard,
  courierBoard,
  declineDelivery,
  cancelDelivery,
  createDeliveryOrder,
  suggestAddresses,
  creditAsAdmin,
  deliverDelivery,
  deliveryDatabaseStatus,
  listMine,
  pickupDelivery,
  registerAccount,
  requestLogin,
  reviewDoc,
  pingCourier,
  savePushToken,
  setCourierShift,
  submitDoc,
  useDeliveryRepository,
  verifyLogin,
} from "./deliveryService";
import { expoPushBody, setExpoPushSender } from "./expoPush";
import { readDevOtp } from "./sms";
import { assertOnline, postRpc } from "../services/rpcCall";
import type { Account, AuthSession } from "../types";

const previousOtp = process.env.EG_OTP_DEV;
const previousAdmin = process.env.EG_ADMIN_PHONES;
const previousSms = process.env.SMS_WEBHOOK_URL;
const previousEskizEmail = process.env.ESKIZ_EMAIL;
const previousEskizSecret = process.env.ESKIZ_SECRET;
process.env.EG_OTP_DEV = "1";
process.env.EG_ADMIN_PHONES = "";
delete process.env.SMS_WEBHOOK_URL;
delete process.env.ESKIZ_EMAIL;
delete process.env.ESKIZ_SECRET;

function actorOf(account: Account): Actor {
  return {
    id: account.id,
    role: account.role,
    phone: account.phone,
    name: account.name,
    isAdmin: account.isAdmin,
  };
}

function useTempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "expressgo-delivery-"));
  const repo = createFileDeliveryRepository(join(dir, "delivery.json"));
  useDeliveryRepository(repo, false);
  return repo;
}

async function signIn(
  role: "sender" | "courier",
  phone: string,
  name: string,
  vehicle?: "walk" | "moto" | "car" | "cargo",
): Promise<AuthSession> {
  await registerAccount({ role, name, phone, vehicle, deposit: 900000 });
  await requestLogin({ role, phone });
  const code = readDevOtp(phone);
  assert.ok(code);
  const session = await verifyLogin({ role, phone, code: code ?? "" });
  assert.equal(Object.hasOwn(session, "code"), false);
  return session;
}

test.after(() => {
  process.env.EG_OTP_DEV = previousOtp;
  process.env.EG_ADMIN_PHONES = previousAdmin;
  if (previousSms === undefined) delete process.env.SMS_WEBHOOK_URL;
  else process.env.SMS_WEBHOOK_URL = previousSms;
  if (previousEskizEmail === undefined) delete process.env.ESKIZ_EMAIL;
  else process.env.ESKIZ_EMAIL = previousEskizEmail;
  if (previousEskizSecret === undefined) delete process.env.ESKIZ_SECRET;
  else process.env.ESKIZ_SECRET = previousEskizSecret;
  useDeliveryRepository(null, false);
});

test("yetkazib berish bazasi ulanmagan deb qoladi, toki DATABASE_URL tekshirilmaguncha", () => {
  useDeliveryRepository(null, false);
  const status = deliveryDatabaseStatus();
  assert.equal(status.ready, false);
  assert.match(status.reason, /DATABASE_URL/);
});

test("ochiq supabase siyosati qolmagan va yetkazish jadvali anonimga yopiq", () => {
  const retired = readFileSync(new URL("../../supabase/expressgo.sql", import.meta.url), "utf8");
  const delivery = readFileSync(new URL("../../supabase/eg_delivery.sql", import.meta.url), "utf8");
  const claim = readFileSync(new URL("./deliveryPg.ts", import.meta.url), "utf8");
  assert.doesNotMatch(retired, /using\s*\(\s*true\s*\)/i);
  assert.match(retired, /revoke all on table public\.eg_orders from anon/);
  assert.doesNotMatch(delivery, /using\s*\(\s*true\s*\)/i);
  assert.match(delivery, /revoke all on table public\.eg_delivery_orders from anon/);
  assert.match(delivery, /force row level security/);
  assert.match(claim, /status = 'posted' and courier_id is null/);
});

test("mijoz buyurtma yaratadi va ikkinchi mijoz uni ko'ra olmaydi", async () => {
  useTempRepo();
  const first = await signIn("sender", "998900000001", "Ali");
  const second = await signIn("sender", "998900000002", "Vali");
  const order = await createDeliveryOrder(actorOf(first.account), {
    senderId: second.account.id,
    pickup: "Shahrixon markaz",
    dropoff: "Bozor",
    item: "Hujjat",
    customerPhone: "998900000009",
    vehicle: "walk",
    deliveryFee: 1,
  });
  assert.match(order.id, /^PX-/);
  const mine = await listMine(actorOf(first.account));
  const other = await listMine(actorOf(second.account));
  assert.equal(mine.some((item) => item.id === order.id), true);
  assert.equal(other.some((item) => item.id === order.id), false);
  assert.ok(order.deliveryFee >= 8000);
});

test("ro'yxatdan o'tish kuryer egizagi va depozit yaratmaydi", async () => {
  const repo = useTempRepo();
  const account = await registerAccount({
    role: "sender",
    name: "Ali",
    phone: "998900000003",
    deposit: 500000,
  });
  assert.equal(account.role, "sender");
  assert.equal(account.balance, null);
  assert.equal(account.isAdmin, false);
  assert.equal(await repo.readUserByPhone("998900000003", "courier"), null);
  const courier = await registerAccount({
    role: "courier",
    name: "Ali",
    phone: "998900000003",
    vehicle: "walk",
    deposit: 500000,
  });
  assert.equal(courier.balance, 0);
});

test("SMS sozlanmasa sinov kodi 1234 qabul qilinadi", async () => {
  useTempRepo();
  await registerAccount({ role: "sender", name: "Ali", phone: "998900000004" });
  process.env.EG_OTP_DEV = "";
  delete process.env.SMS_WEBHOOK_URL;
  delete process.env.ESKIZ_EMAIL;
  delete process.env.ESKIZ_SECRET;
  delete process.env.ESKIZ_LIVE;
  try {
    const challenge = await requestLogin({ role: "sender", phone: "998900000004" });
    assert.equal(challenge.testCode, "1234");
    await assert.rejects(() => verifyLogin({ role: "sender", phone: "998900000004", code: "0000" }), /noto'g'ri/);
    const session = await verifyLogin({ role: "sender", phone: "998900000004", code: "1234" });
    assert.equal(session.account.phone, "998900000004");
    assert.ok(session.token);
    assert.equal(readDevOtp("998900000004"), null);
  } finally {
    process.env.EG_OTP_DEV = "1";
  }
});

test("admin hujjat bo'limi kutilayotgan rasmlarni ko'rsatadi", async () => {
  const repo = useTempRepo();
  const courier = await signIn("courier", "998900000031", "Karim", "car");
  const admin = await signIn("sender", "998900000032", "Admin");
  const adminUser = await repo.readUser(admin.account.id);
  assert.ok(adminUser);
  adminUser.isAdmin = true;
  await repo.writeUser(adminUser);
  const adminActor = { ...actorOf(admin.account), isAdmin: true };
  await submitDoc(actorOf(courier.account), "passport", "file://passport");
  await submitDoc(actorOf(courier.account), "license", "file://license");
  await submitDoc(actorOf(courier.account), "vehicle", "file://vehicle");
  const board = await adminBoard(adminActor);
  assert.equal(board.reviews.length, 3);
  assert.equal(board.people.find((person) => person.id === courier.account.id)?.docsPending, 3);
  await reviewDoc(adminActor, courier.account.id, "passport", true);
  const after = await adminBoard(adminActor);
  assert.equal(after.reviews.length, 2);
  assert.equal(after.reviews.some((item) => item.kind === "passport"), false);
});

test("kuryer xaritada o'z belgisini ko'radi", async () => {
  useTempRepo();
  const courier = await signIn("courier", "998900000061", "Karim", "walk");
  const actor = actorOf(courier.account);
  assert.equal((await courierBoard(actor)).pins.length, 0);
  const board = await pingCourier(actor, 40.71, 71.06);
  assert.equal(board.pins.length, 1);
  assert.equal(board.pins[0]?.kind, "courier");
  assert.equal(board.pins[0]?.tone, "free");
  assert.equal(board.pins[0]?.lat, 40.71);
  assert.equal(board.pins[0]?.lng, 71.06);
});

test("yaqin buyurtma ochiq ilovada taklif bo'lib chiqadi", async () => {
  const repo = useTempRepo();
  const sender = await signIn("sender", "998900000071", "Ali");
  const courier = await signIn("courier", "998900000072", "Karim", "walk");
  const admin = await signIn("sender", "998900000073", "Admin");
  const adminUser = await repo.readUser(admin.account.id);
  assert.ok(adminUser);
  adminUser.isAdmin = true;
  await repo.writeUser(adminUser);
  const adminActor = { ...actorOf(admin.account), isAdmin: true };
  await submitDoc(actorOf(courier.account), "passport", "file://passport");
  await reviewDoc(adminActor, courier.account.id, "passport", true);
  await creditAsAdmin(adminActor, courier.account.id, 20000);
  const fresh = await repo.readUser(courier.account.id);
  assert.ok(fresh);
  await setCourierShift({ ...actorOf(courier.account), id: fresh.id }, true);
  await pingCourier(actorOf(courier.account), 40.71, 71.06);
  const quiet = await courierBoard(actorOf(courier.account));
  assert.equal(quiet.ping, null);
  await createDeliveryOrder(actorOf(sender.account), {
    pickup: "Shahrixon markaz",
    dropoff: "Bozor",
    item: "Hujjat",
    customerPhone: "998900000079",
    vehicle: "walk",
    pickupLat: 40.712,
    pickupLng: 71.061,
    dropoffLat: 40.72,
    dropoffLng: 71.07,
  });
  const board = await courierBoard(actorOf(courier.account));
  assert.equal(board.ping?.offeredToYou, true);
  assert.equal(board.ping?.item, "Hujjat");
  assert.ok((board.ping?.pingUntil ?? 0) > Date.now());
  const again = await courierBoard(actorOf(courier.account));
  assert.equal(again.ping?.pingUntil, board.ping?.pingUntil);
  await declineDelivery(actorOf(courier.account), board.ping?.id ?? "");
  assert.equal((await courierBoard(actorOf(courier.account))).ping, null);
});

test("vakolatsiz foydalanuvchi admin amalini bajara olmaydi", async () => {
  useTempRepo();
  const sender = await signIn("sender", "998900000011", "Ali");
  const courier = await signIn("courier", "998900000012", "Karim", "walk");
  await assert.rejects(() => creditAsAdmin(actorOf(sender.account), courier.account.id, 10000), /administrator/i);
  await assert.rejects(() => adminBoard(actorOf(sender.account)), /administrator/i);
  await assert.rejects(() => reviewDoc(actorOf(sender.account), courier.account.id, "passport", true), /administrator/i);
});

test("kuryer buyurtmani qabul qiladi, ikkinchisi egallay olmaydi va noto'g'ri holat rad etiladi", async () => {
  const repo = useTempRepo();
  const sender = await signIn("sender", "998900000021", "Ali");
  const first = await signIn("courier", "998900000022", "Karim", "walk");
  const second = await signIn("courier", "998900000023", "Sobir", "walk");
  const admin = await signIn("sender", "998900000024", "Admin");
  const adminUser = await repo.readUser(admin.account.id);
  assert.ok(adminUser);
  adminUser.isAdmin = true;
  await repo.writeUser(adminUser);
  const adminActor = { ...actorOf(admin.account), isAdmin: true };
  for (const courier of [first.account, second.account]) {
    await submitDoc(actorOf(courier), "passport", "file://passport");
    await reviewDoc(adminActor, courier.id, "passport", true);
    await creditAsAdmin(adminActor, courier.id, 20000);
    const fresh = await repo.readUser(courier.id);
    assert.ok(fresh);
    await setCourierShift({ ...actorOf(courier), ...{ id: fresh.id } }, true);
  }
  const order = await createDeliveryOrder(actorOf(sender.account), {
    pickup: "Shahrixon markaz",
    dropoff: "Bozor",
    item: "Hujjat",
    customerPhone: "998900000029",
    vehicle: "walk",
  });
  await assert.rejects(() => deliverDelivery(actorOf(first.account), order.id));
  const [one, two] = await Promise.allSettled([
    acceptDelivery(actorOf(first.account), order.id),
    acceptDelivery(actorOf(second.account), order.id),
  ]);
  const won = [one, two].filter((item) => item.status === "fulfilled");
  assert.equal(won.length, 1);
  const saved = await repo.readOrder(order.id);
  assert.ok(saved?.courierId);
  const winner = saved.courierId === first.account.id ? first.account : second.account;
  assert.equal(saved.acceptedAt != null, true);
  await pickupDelivery(actorOf(winner), order.id);
  const picked = await repo.readOrder(order.id);
  assert.equal(picked?.status, "picked_up");
  assert.equal(picked?.pickedUpAt != null, true);
  const delivered = await deliverDelivery(actorOf(winner), order.id);
  assert.equal(delivered.active, null);
  assert.equal(delivered.completed[0]?.status, "delivered");
  assert.equal(delivered.completed[0]?.deliveredAt != null, true);
  await assert.rejects(() => cancelDelivery(actorOf(sender.account), order.id), /olingan|bekor/i);
});

test("server yopilib ochilsa buyurtma omborda qoladi", async () => {
  const dir = mkdtempSync(join(tmpdir(), "expressgo-restart-"));
  const file = join(dir, "delivery.json");
  useDeliveryRepository(createFileDeliveryRepository(file), false);
  const sender = await signIn("sender", "998900000031", "Ali");
  const order = await createDeliveryOrder(actorOf(sender.account), {
    pickup: "Shahrixon markaz",
    dropoff: "Bozor",
    item: "Hujjat",
    customerPhone: "998900000039",
    vehicle: "walk",
  });
  useDeliveryRepository(null, false);
  useDeliveryRepository(createFileDeliveryRepository(file), false);
  const mine = await listMine(actorOf(sender.account));
  assert.equal(mine.some((item) => item.id === order.id), true);
});

test("server ishlamasa buyurtma muvaffaqiyatli deb belgilanmaydi", async () => {
  let done = false;
  assert.throws(() => assertOnline("", "Yetkazib berish serveri ulanmagan. Buyurtma saqlanmadi."), /saqlanmadi/);
  assert.equal(done, false);
  await assert.rejects(
    postRpc("http://127.0.0.1:9", "createOrder", [{}], "", "Yetkazib berish serveri ulanmagan. Buyurtma saqlanmadi."),
    /saqlanmadi/,
  );
  const server = createRpcServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await assert.rejects(
      postRpc(`http://127.0.0.1:${address.port}`, "createOrder", [{}], "", "ulanmadi"),
      /Sessiya yo'q|ulanmagan|saqlanmadi/,
    );
    assert.equal(done, false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("smenasi ochiq kuryerga yopiq ilova xabari boradi", async () => {
  const repo = useTempRepo();
  const sent: { to: string; title: string }[] = [];
  setExpoPushSender(async (items) => {
    sent.push(...items);
  });
  try {
    const sender = await signIn("sender", "998900000051", "Ali");
    const on = await signIn("courier", "998900000052", "Karim", "walk");
    const off = await signIn("courier", "998900000053", "Sobir", "walk");
    const admin = await signIn("sender", "998900000054", "Admin");
    const adminUser = await repo.readUser(admin.account.id);
    assert.ok(adminUser);
    adminUser.isAdmin = true;
    await repo.writeUser(adminUser);
    const adminActor = { ...actorOf(admin.account), isAdmin: true };
    for (const courier of [on.account, off.account]) {
      await submitDoc(actorOf(courier), "passport", "file://passport");
      await reviewDoc(adminActor, courier.id, "passport", true);
      await creditAsAdmin(adminActor, courier.id, 20000);
    }
    await setCourierShift(actorOf(on.account), true);
    await savePushToken(actorOf(on.account), "ExponentPushToken[on]");
    await savePushToken(actorOf(off.account), "ExponentPushToken[off]");
    await savePushToken(actorOf(sender.account), "ExponentPushToken[sender]");
    await pingCourier(actorOf(on.account), 40.71, 71.06);
    sent.length = 0;
    const order = await createDeliveryOrder(actorOf(sender.account), {
      pickup: "Shahrixon markaz",
      dropoff: "Bozor",
      item: "Hujjat",
      customerPhone: "998900000059",
      vehicle: "walk",
      pickupLat: 40.71,
      pickupLng: 71.06,
      deliveryFee: 1,
    });
    const offer = sent.find((item) => item.to === "ExponentPushToken[on]" && item.title === "Yangi Buyurtma!");
    assert.ok(offer);
    assert.equal(expoPushBody([offer])[0]?.channelId, "order-alert");
    assert.equal(expoPushBody([offer])[0]?.sound, "order_alert.mp3");
    assert.equal(sent.some((item) => item.to === "ExponentPushToken[off]"), false);
    sent.length = 0;
    await acceptDelivery(actorOf(on.account), order.id);
    const accepted = sent.find((item) => item.to === "ExponentPushToken[sender]" && item.title === "Kuryer qabul qildi");
    assert.ok(accepted);
    assert.equal(expoPushBody([accepted])[0]?.channelId, "express-go");
    assert.equal(expoPushBody([accepted])[0]?.sound, "default");
  } finally {
    setExpoPushSender(null);
  }
});

test("eng ko'p yuborilgan manzil birinchi taklif qilinadi", async () => {
  useTempRepo();
  const sender = await signIn("sender", "998900000077", "Ali");
  const actor = actorOf(sender.account);
  const base = { item: "Hujjat", customerPhone: "998900000009", vehicle: "walk" as const, deliveryFee: 20000 };
  await createDeliveryOrder(actor, { ...base, pickup: "Asaka", dropoff: "Bozor", pickupLat: 40.64, pickupLng: 72.23 });
  await createDeliveryOrder(actor, { ...base, pickup: "Shahrixon markaz", dropoff: "Bozor", pickupLat: 40.71, pickupLng: 72.05 });
  await createDeliveryOrder(actor, { ...base, pickup: "Шаҳрихон марказ", dropoff: "Bozor", pickupLat: 40.712, pickupLng: 72.057 });
  const rows = await suggestAddresses("shahrix");
  assert.equal(rows[0]?.label, "Шаҳрихон марказ");
  assert.ok((rows[0]?.uses ?? 0) >= 2);
});

test("telegram raqami mos kelsa parol bilan kiriladi", async () => {
  useTempRepo();
  const prevToken = process.env.TELEGRAM_LOGIN_BOT_TOKEN;
  const prevName = process.env.TELEGRAM_LOGIN_BOT_USERNAME;
  process.env.TELEGRAM_LOGIN_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_LOGIN_BOT_USERNAME = "ExpressGoLoginBot";
  try {
    assert.equal(authMethod().mode, "telegram");
    const challenge = await beginTelegramSignup({ role: "sender", name: "Lola", phone: "998900000081" });
    assert.equal(await attachLoginChat(challenge.id, 42), true);
    assert.equal(await confirmLoginContact(42, "998900000099", true), "mismatch");
    assert.equal(await confirmLoginContact(42, "+998900000081", false), "mismatch");
    assert.equal(await confirmLoginContact(42, "+998 90 000 00 81", true), "ok");
    const session = await finishTelegramSignup({ id: challenge.id, password: "sir123" });
    assert.equal(session.account.name, "Lola");
    await assert.rejects(() => loginWithPassword({ role: "sender", phone: "998900000081", password: "wrong1" }), /noto'g'ri/);
    const again = await loginWithPassword({ role: "sender", phone: "998900000081", password: "sir123" });
    assert.equal(again.account.id, session.account.id);
    const reset = await beginPasswordReset({ role: "sender", phone: "998900000081" });
    assert.equal(await attachLoginChat(reset.id, 77), true);
    assert.equal(await confirmLoginContact(77, "998900000081", true), "ok");
    await finishPasswordReset({ id: reset.id, password: "next123" });
    await assert.rejects(() => loginWithPassword({ role: "sender", phone: "998900000081", password: "sir123" }), /noto'g'ri/);
    const next = await loginWithPassword({ role: "sender", phone: "998900000081", password: "next123" });
    assert.ok(next.token);
  } finally {
    if (prevToken === undefined) delete process.env.TELEGRAM_LOGIN_BOT_TOKEN;
    else process.env.TELEGRAM_LOGIN_BOT_TOKEN = prevToken;
    if (prevName === undefined) delete process.env.TELEGRAM_LOGIN_BOT_USERNAME;
    else process.env.TELEGRAM_LOGIN_BOT_USERNAME = prevName;
  }
});

test("sinov hisobi HTTP orqali ham ochilmaydi", async () => {
  useDeliveryRepository(null, false);
  const server = createRpcServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await assert.rejects(
      postRpc(
        `http://127.0.0.1:${address.port}`,
        "ensureDemoPair",
        [{ name: "Ali", phone: "998900000041" }],
        "",
        "xato",
      ),
      /Sessiya yo'q|o'chirilgan/,
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
