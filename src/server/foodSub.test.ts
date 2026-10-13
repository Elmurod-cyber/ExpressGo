import assert from "node:assert/strict";
import test from "node:test";
import {
  placeFoodOrder,
  registerFoodOwner,
  rememberFoodOwnerUntil,
  requestGuestCode,
  setFoodAccepting,
  startFoodSub,
  verifyGuestCode,
} from "./store";
import { readDevOtp } from "./sms";
import { FOOD_SUB_PRICE } from "./rules";

process.env.EG_OTP_DEV = "1";

test("fastfud egasi bir oy bepul, keyin obunasiz buyurtma olmaydi", async () => {
  const placeId = "sub-burger";
  const phone = "998900000061";
  const owner = registerFoodOwner(placeId, "Aziz", phone);
  assert.equal(owner.active, true);
  assert.equal(owner.price, FOOD_SUB_PRICE);
  assert.equal(owner.price, 99000);
  assert.equal(registerFoodOwner(placeId, "Aziz", phone).id, owner.id);
  assert.throws(() => registerFoodOwner(placeId, "Boshqa", "998900000062"));

  const challenge = await requestGuestCode("food", "998900000063");
  const code = readDevOtp("998900000063");
  assert.ok(code);
  assert.equal(JSON.stringify(challenge).includes(code), false);
  const customer = await verifyGuestCode("food", "998900000063", code, "Mijoz");
  const ticket = await placeFoodOrder({
    placeId,
    placeName: "Burger",
    pickup: "Shahrixon markaz",
    staffPhone: "998900000088",
    name: "Mijoz",
    phone: "998900000099",
    dropoff: "Uy 1",
    handoff: "courier",
    lines: [{ name: "Lavash", qty: 1, price: 20000 }],
    guestToken: customer.token,
  });
  assert.equal(ticket.placeId, placeId);

  rememberFoodOwnerUntil(placeId, phone, Date.now() - 1000);
  await assert.rejects(
    placeFoodOrder({
      placeId,
      placeName: "Burger",
      pickup: "Shahrixon markaz",
      staffPhone: "998900000088",
      name: "Mijoz",
      phone: "998900000099",
      dropoff: "Uy 1",
      handoff: "courier",
      lines: [{ name: "Lavash", qty: 1, price: 20000 }],
      guestToken: customer.token,
    }),
  );
  assert.throws(() => setFoodAccepting(placeId, phone, true));
  const renewed = startFoodSub(placeId, phone);
  assert.equal(renewed.active, true);
  assert.equal(renewed.price, 99000);
  setFoodAccepting(placeId, phone, true);
});
