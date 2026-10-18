import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyInitData } from "./partner";
import { kitchenStep, linkKitchenChat, listKitchenForPhone, placeFoodOrder, requestGuestCode, verifyGuestCode } from "./store";
import { readDevOtp } from "./sms";

test("telegram imzosi restoran chatini ajratadi", () => {
  const token = "test-token";
  const user = JSON.stringify({ id: 42 });
  const authDate = "1700000000";
  const pairs = [`auth_date=${authDate}`, `user=${user}`].sort();
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(pairs.join("\n")).digest("hex");
  const initData = `user=${encodeURIComponent(user)}&auth_date=${authDate}&hash=${hash}`;
  assert.equal(verifyInitData(initData, token, 1_700_000_000_000), 42);
  assert.equal(verifyInitData(initData, "boshqa", 1_700_000_000_000), null);
});

test("oshxona qabul qiladi va olib ketishda kuryer chaqirmaydi", async () => {
  process.env.EG_OTP_DEV = "1";
  const phone = "998900000123";
  await requestGuestCode("food", phone);
  const code = readDevOtp(phone);
  if (!code) throw new Error("Kod saqlanmadi.");
  const pass = await verifyGuestCode("food", phone, code, "Ali");
  const ticket = await placeFoodOrder({
    placeId: "shahrixon",
    placeName: "Shahrixon Fastfood",
    pickup: "Shahrixon markaz",
    staffPhone: "998902223377",
    name: "Ali",
    phone,
    dropoff: "Shahrixon markaz",
    handoff: "pickup",
    lines: [{ name: "Lavash", qty: 2, price: 28000 }],
    guestToken: pass.token,
  });
  assert.throws(() => linkKitchenChat("998900000000", 7), /tegishli emas/);
  const place = linkKitchenChat("90 222 33 77", 7);
  assert.equal(place.name, "Shahrixon Fastfood");
  const accepted = await kitchenStep(place.name ? "998902223377" : "", ticket.id, "accept");
  assert.equal(accepted.ticket.status, "preparing");
  const ready = await kitchenStep("998902223377", ticket.id, "ready");
  assert.equal(ready.ticket.status, "ready");
  assert.match(ready.note, /olib ketadi/);
  const rows = listKitchenForPhone("998902223377");
  assert.equal(rows.some((item) => item.id === ticket.id), true);
});
