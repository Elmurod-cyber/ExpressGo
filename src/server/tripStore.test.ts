import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { postTrip, listTrips, updateTrip, deleteTrip, listMyTrips, registerTripAccount, requestGuestCode, revealTripPhone, rememberTripPassUntil, startTripPass, tripPassStatus, verifyGuestCode, useTripRepository, type StoredDriverPass, type StoredTrip, type TripRepository } from "./store";
import { readDevOtp } from "./sms";
import { createRpcServer } from "./rpcHttp";
import { tripDatabaseStatus } from "./tripDb";

const secret = "998901112233";

async function riderToken(phone: string, name: string): Promise<string> {
  process.env.EG_OTP_DEV = "1";
  await requestGuestCode("rider", phone);
  const code = readDevOtp(phone);
  if (!code) throw new Error("Kod saqlanmadi.");
  const pass = await verifyGuestCode("rider", phone, code, name);
  return pass.token;
}

function memoryRepo(seed: StoredTrip[] = []): TripRepository & { rows: StoredTrip[] } {
  const rows = seed.map((row) => ({ ...row }));
  return {
    rows,
    async list() {
      return rows.map((row) => ({ ...row }));
    },
    async upsert(row) {
      const index = rows.findIndex((item) => item.id === row.id);
      if (index < 0) rows.push({ ...row });
      else rows[index] = { ...row };
    },
    async remove(id) {
      const index = rows.findIndex((item) => item.id === id);
      if (index >= 0) rows.splice(index, 1);
    },
  };
}

test("shaharlararo e'lon jadvali anonim mijozga yopiq", () => {
  const sql = readFileSync(new URL("../../supabase/eg_trip_ads.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /revoke all on table public\.eg_trip_ads from anon/);
  assert.match(sql, /revoke all on table public\.eg_trip_ads from authenticated/);
  assert.match(sql, /create table if not exists public\.eg_driver_passes/);
  assert.match(sql, /revoke all on table public\.eg_driver_passes from anon/);
  assert.doesNotMatch(sql, /create policy/i);
  assert.doesNotMatch(sql, /grant /i);
});

test("baza ulanmagan deb qoladi, toki DATABASE_URL tekshirilmaguncha", () => {
  const status = tripDatabaseStatus();
  assert.equal(status.ready, false);
  assert.match(status.reason, /DATABASE_URL/);
});

test("ikki o'quvchi bitta e'lonni ko'radi, to'liq telefon ochiq ro'yxatda yo'q", async () => {
  const repo = memoryRepo();
  await useTripRepository(repo);
  const phone = secret;
  const rider = registerTripAccount("rider", "Ali", phone, await riderToken(phone, "Ali"));
  const card = await postTrip({
    name: "Ali",
    phone,
    from: "Shahrixon",
    to: "Toshkent",
    fromLat: 40.71,
    fromLng: 71.06,
    toLat: 41.31,
    toLng: 69.24,
    whenLabel: "12 okt, 15:00",
    seats: 2,
    price: 50000,
    note: "Eshik oldida",
  });
  const listed = await listTrips({ mode: "route" });
  const mine = await listMyTrips(rider.id);
  const body = JSON.stringify({ listed, mine, card });
  assert.equal(listed.some((item) => item.id === card.id), true);
  assert.equal(mine.some((item) => item.id === card.id), true);
  assert.equal(body.includes(phone), false);
  assert.match(body, /\*\*/);
  const updated = await updateTrip(card.id, rider.id, {
    name: "Ali",
    phone,
    from: "Andijon",
    to: "Toshkent",
    fromLat: 40.78,
    fromLng: 72.34,
    toLat: 41.31,
    toLng: 69.24,
    whenLabel: "13 okt, 09:00",
    seats: 1,
    price: 60000,
    note: "",
  });
  assert.equal(updated.from, "Andijon");
  assert.equal(repo.rows.find((row) => row.id === card.id)?.from, "Andijon");
  await deleteTrip(card.id, rider.id);
  const after = await listTrips({ mode: "route" });
  assert.equal(after.some((item) => item.id === card.id), false);
  assert.equal(repo.rows.some((item) => item.id === card.id), false);
});

test("bitta serverdagi ikki mijoz e'lonni ko'radi", async () => {
  const server = createRpcServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(`${base}/health`);
    const healthBody = (await health.json()) as { tripsDb: boolean };
    assert.equal(healthBody.tripsDb, false);
    const posted = await fetch(`${base}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "postTrip",
        args: [
          {
            name: "Vali",
            phone: secret,
            from: "Shahrixon",
            to: "Toshkent",
            fromLat: 40.71,
            fromLng: 71.06,
            toLat: 41.31,
            toLng: 69.24,
            whenLabel: "ertaga 08:00",
            seats: 1,
            price: 40000,
            note: "",
          },
        ],
      }),
    });
    assert.equal(posted.ok, true);
    const listed = await fetch(`${base}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "listTrips", args: [{ mode: "route" }] }),
    });
    const payload = await listed.text();
    assert.match(payload, /Shahrixon/);
    assert.equal(payload.includes(secret), false);
    assert.match(payload, /\*\*/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("ikki yo'lovchi aralashmaydi, haydovchi ID bir xil qoladi", async () => {
  const firstToken = await riderToken("998900000021", "Ali");
  const first = registerTripAccount("rider", "Ali", "998900000021", firstToken);
  const second = registerTripAccount("rider", "Vali", "998900000022", await riderToken("998900000022", "Vali"));
  assert.equal(registerTripAccount("rider", "Ali", "+998 90 000 00 21", firstToken).id, first.id);
  const card = await postTrip({
    name: "Ali",
    phone: "998900000099",
    accountId: first.id,
    from: "Shahrixon",
    to: "Toshkent",
    fromLat: 40.71,
    fromLng: 71.06,
    toLat: 41.31,
    toLng: 69.24,
    whenLabel: "ertaga 10:00",
    seats: 1,
    price: 45000,
    note: "",
  });
  const mineFirst = await listMyTrips(first.id);
  const mineSecond = await listMyTrips(second.id);
  assert.equal(mineFirst.some((item) => item.id === card.id), true);
  assert.equal(mineSecond.some((item) => item.id === card.id), false);
  await assert.rejects(updateTrip(card.id, second.id, {
    name: "Vali",
    phone: "998900000022",
    from: "Andijon",
    to: "Toshkent",
    fromLat: 40.78,
    fromLng: 72.34,
    toLat: 41.31,
    toLng: 69.24,
    whenLabel: "ertaga 11:00",
    seats: 1,
    price: 45000,
    note: "",
  }));
  const driver = registerTripAccount("driver", "Sardor", "998900000033");
  assert.equal(registerTripAccount("driver", "Sardor", "998900000033").id, driver.id);
  const trial = tripPassStatus(driver.id);
  assert.equal(trial.active, true);
  assert.equal(trial.price, 99000);
  assert.equal(trial.days, 30);
  assert.equal(trial.driverId, driver.id);
  const opened = await revealTripPhone(card.id, driver.id);
  assert.equal(opened.ok, true);
  if (opened.ok) assert.equal(opened.address.includes(secret), false);
  const listed = await listTrips({ mode: "route" });
  assert.equal(listed.find((item) => item.id === card.id)?.note, "");
  rememberTripPassUntil(driver.id, Date.now() - 1000);
  const closed = await revealTripPhone(card.id, driver.id);
  assert.equal(closed.ok, false);
  if (!closed.ok) {
    assert.equal(closed.price, 99000);
    assert.equal(closed.days, 30);
  }
  const pass = startTripPass(driver.id);
  assert.equal(pass.active, true);
  assert.equal(pass.driverId, driver.id);
  assert.throws(() => startTripPass("998900000044"));
});

test("haydovchi e'lon qoldiradi, narxsiz yo'lovchi kelishiladi", async () => {
  const driver = registerTripAccount("driver", "Sardor", "998900000031");
  const rider = registerTripAccount("rider", "Ali", "998900000032", await riderToken("998900000032", "Ali"));
  const drive = await postTrip({
    name: "Sardor",
    phone: "998900000099",
    accountId: driver.id,
    from: "Andijon",
    to: "Toshkent",
    fromLat: 40.78,
    fromLng: 72.34,
    toLat: 41.31,
    toLng: 69.24,
    whenLabel: "juma 08:00",
    seats: 3,
    price: 80000,
    note: "3 o'rin bo'sh",
    vehicle: "Cobalt",
    photo: "data:image/jpeg;base64,abc",
  });
  const ride = await postTrip({
    name: "Ali",
    phone: "998900000098",
    accountId: rider.id,
    from: "Shahrixon",
    to: "Toshkent",
    fromLat: 40.71,
    fromLng: 71.06,
    toLat: 41.31,
    toLng: 69.24,
    whenLabel: "ertaga",
    seats: 1,
    price: 0,
    note: "",
  });
  const listed = await listTrips({ mode: "route", to: "Toshkent" });
  assert.equal(listed.find((item) => item.id === drive.id)?.offer, "driver");
  assert.equal(listed.find((item) => item.id === drive.id)?.vehicle, "Cobalt");
  assert.equal(listed.find((item) => item.id === drive.id)?.photo, "data:image/jpeg;base64,abc");
  assert.equal(listed.find((item) => item.id === drive.id)?.note, "3 o'rin bo'sh");
  assert.equal(listed.find((item) => item.id === ride.id)?.offer, "rider");
  assert.equal(listed.find((item) => item.id === ride.id)?.price, 0);
  assert.equal((await listMyTrips(driver.id)).some((item) => item.id === drive.id), true);
  assert.equal((await listMyTrips(driver.id)).some((item) => item.id === ride.id), false);
  assert.equal((await listMyTrips(rider.id)).some((item) => item.id === ride.id), true);
  assert.equal((await listMyTrips(rider.id)).some((item) => item.id === drive.id), false);
});

test("haydovchi 30 kuni qayta ro'yxatda uzaymaydi", async () => {
  const kept = Date.now() + 10 * 24 * 60 * 60 * 1000;
  const passes: StoredDriverPass[] = [{ phone: "998900000091", driverId: "TG-OLD", until: kept }];
  const repo: TripRepository = {
    ...memoryRepo(),
    async listPasses() {
      return passes.map((row) => ({ ...row }));
    },
    async grantPass(row) {
      const found = passes.find((item) => item.phone.slice(-9) === row.phone.slice(-9));
      if (found) {
        found.driverId = row.driverId;
        return { ...found };
      }
      passes.push({ ...row });
      return { ...row };
    },
    async renewPass(row) {
      const found = passes.find((item) => item.phone.slice(-9) === row.phone.slice(-9));
      if (found) Object.assign(found, row);
      else passes.push({ ...row });
    },
  };
  await useTripRepository(repo);
  const card = registerTripAccount("driver", "Sardor", "998900000091");
  const status = tripPassStatus(card.id);
  assert.equal(status.active, true);
  assert.equal(status.until, kept);
  const again = registerTripAccount("driver", "Sardor", "+998 90 000 00 91");
  assert.equal(tripPassStatus(again.id).until, kept);
});

test("server yopiq bo'lsa mijoz ulanolmaydi", async () => {
  const server = createServer((_req, res) => {
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await assert.rejects(fetch(`http://127.0.0.1:${address.port}/rpc`));
});
