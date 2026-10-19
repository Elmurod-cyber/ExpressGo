import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { networkInterfaces } from "node:os";
import { adoptFoodOrders, exportSnapshot, importSnapshot, useConstructionRepository, useTripRepository } from "./store";
import { connectDeliveryDatabase } from "./deliveryPg";
import { connectTripDatabase, tripRepository } from "./tripDb";
import { connectConstructionDatabase, constructionRepository } from "./constructionDb";
import { connectFoodDatabase, listFoodOrdersForBoot, saveFoodCartRows, saveFoodOrderRow, saveFoodUserRow } from "./foodDb";
import { setFoodNotify, setFoodPersist } from "./foodPersist";
import { armTelegram, notifyKitchen } from "./partner";
import { createRpcServer } from "./rpcHttp";

const PORT = Number(process.env.PORT) || 8787;
const FILE = join(process.cwd(), "data", "expressgo.json");

function loadServerEnv() {
  const path = join(process.cwd(), ".env");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadFile() {
  if (!existsSync(FILE)) return;
  try {
    importSnapshot(JSON.parse(readFileSync(FILE, "utf8")));
  } catch {
    console.warn("Saqlangan fayl o'qilmadi, bo'sh store.");
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(exportSnapshot()));
  }, 250);
}

function lanAddresses(): string[] {
  const found: string[] = [];
  for (const rows of Object.values(networkInterfaces())) {
    for (const row of rows ?? []) {
      if (row.internal || row.family !== "IPv4") continue;
      found.push(row.address);
    }
  }
  return found;
}

loadServerEnv();
loadFile();

const server = createRpcServer(scheduleSave);

void (async () => {
  const delivery = await connectDeliveryDatabase();
  if (delivery.ok) {
    console.log("Yetkazib berish jadvali ulangan.");
  } else {
    console.warn(delivery.reason);
    console.warn("SQL: supabase/eg_delivery.sql. DATABASE_URL ni ilovaga yozmang.");
  }

  const db = await connectTripDatabase();
  if (db.ok) {
    const used = await useTripRepository(tripRepository());
    console.log(`Shaharlararo jadval ulangan. E'lonlar: ${used.count}${used.seeded ? " (eski nusxa jadvalga ko'chirildi)" : ""}.`);
  } else {
    console.warn(`Shaharlararo baza tayyor emas. ${db.reason}`);
    console.warn("Server kaliti: DATABASE_URL. Buni EXPO_PUBLIC_ qilib ilovaga yozmang.");
    console.warn("SQL: supabase/eg_trip_ads.sql");
  }

  const food = await connectFoodDatabase();
  if (food.ok) {
    setFoodPersist({ saveUser: saveFoodUserRow, saveCart: saveFoodCartRows, saveOrder: saveFoodOrderRow });
    const loaded = await listFoodOrdersForBoot();
    const count = adoptFoodOrders(loaded.orders, loaded.maxSeq);
    console.log(`Taom jadvali ulangan. Buyurtmalar: ${count}.`);
  } else console.warn(food.reason);
  setFoodNotify((info) => {
    void notifyKitchen(info);
  });
  await armTelegram();

  const construction = await connectConstructionDatabase();
  if (construction.ok) {
    const used = await useConstructionRepository(constructionRepository());
    console.log(`Qurilish jadvali ulangan. Ish e'lonlari: ${used.count}${used.seeded ? " (eski nusxa jadvalga ko'chirildi)" : ""}.`);
  } else {
    console.warn(`Qurilish bazasi tayyor emas. ${construction.reason}`);
    console.warn("SQL: supabase/construction.sql");
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Express Go server · ${PORT}`);
    console.log(`Lokal:  http://127.0.0.1:${PORT}`);
    for (const ip of lanAddresses()) {
      console.log(`Tarmoq: http://${ip}:${PORT}`);
    }
    console.log("Ikki telefon shu manzilni Profilga yozadi.");
    const eskiz = Boolean(process.env.ESKIZ_EMAIL?.trim() && process.env.ESKIZ_SECRET?.trim());
    if (!eskiz && !process.env.SMS_WEBHOOK_URL?.trim() && process.env.EG_OTP_DEV !== "1") {
      console.warn("SMS yo'q. Render Environment ga ESKIZ_EMAIL va ESKIZ_SECRET qo'ying.");
    }
  });
})();
