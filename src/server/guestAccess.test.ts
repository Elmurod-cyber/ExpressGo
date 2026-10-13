import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelMyFood,
  listMyFood,
  placeFoodOrder,
  postBuilder,
  registerTripAccount,
  requestGuestCode,
  updateMyFood,
  verifyGuestCode,
} from "./store";
import { readDevOtp } from "./sms";
import { sha256 } from "./sha256";

process.env.EG_OTP_DEV = "1";

async function pass(kind: "rider" | "employer" | "food", phone: string, name: string) {
  const challenge = await requestGuestCode(kind, phone);
  const code = readDevOtp(phone);
  assert.ok(code);
  assert.equal(JSON.stringify(challenge).includes(code), false);
  return verifyGuestCode(kind, phone, code, name);
}

test("sha256 ma'lum natija beradi", () => {
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("yo'lovchi va ish beruvchi kodsiz kira olmaydi", async () => {
  assert.throws(() => registerTripAccount("rider", "Ali", "998900000041"));
  await assert.rejects(
    postBuilder({
      kind: "job",
      name: "Karim",
      phone: "998900000042",
      trade: "plumb",
      region: "Andijon",
      area: "Shahrixon",
      address: "Bog 1",
      text: "Santexnik kerak, 3 kunlik ish.",
      payKind: "deal",
      term: "day",
      workers: 1,
    }),
  );
  const rider = await pass("rider", "998900000041", "Ali");
  const account = registerTripAccount("rider", "Ali", "998900000099", rider.token);
  assert.equal(account.phone.endsWith("41"), true);
});

test("taom zakazi tasdiqlangan telefonga yoziladi va yangisigina tahrirlanadi", async () => {
  await assert.rejects(() =>
    placeFoodOrder({
      placeId: "demo",
      placeName: "Burger",
      pickup: "Shahrixon markaz",
      staffPhone: "998900000088",
      name: "Malika",
      phone: "998900000077",
      dropoff: "Uy 4",
      handoff: "courier",
      lines: [{ name: "Lavash", qty: 1, price: 20000 }],
    }),
  );
  const food = await pass("food", "998900000077", "Malika");
  const ticket = await placeFoodOrder({
    placeId: "demo",
    placeName: "Burger",
    pickup: "Shahrixon markaz",
    staffPhone: "998900000088",
    name: "Boshqa",
    phone: "998900000099",
    dropoff: "Uy 4",
    handoff: "courier",
    lines: [{ name: "Lavash", qty: 1, price: 20000 }],
    guestToken: food.token,
  });
  assert.match(ticket.customerPhone, /77$/);
  const edited = updateMyFood(food.token, ticket.id, {
    dropoff: "Bozor 2",
    lines: [{ name: "Lavash", qty: 2 }],
  });
  assert.equal(edited.dropoff, "Bozor 2");
  assert.equal(edited.lines[0]?.qty, 2);
  assert.equal(edited.foodTotal, 40000);
  const cancelled = cancelMyFood(food.token, ticket.id);
  assert.equal(cancelled.status, "cancelled");
  assert.throws(() => updateMyFood(food.token, ticket.id, { dropoff: "Yana" }));
  const mine = listMyFood(food.token);
  assert.equal(mine.some((item) => item.id === ticket.id), true);
});
