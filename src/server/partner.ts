import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { kitchenByPhone, kitchenMenu } from "./kitchens";
import {
  foodPlaceOpen,
  kitchenChatForPhone,
  kitchenPhoneForChat,
  kitchenReport,
  kitchenStep,
  linkKitchenChat,
  listKitchenForPhone,
  setKitchenOpen,
} from "./store";

type Notice = {
  ticketId: string;
  placeName: string;
  staffPhone: string;
  customerName: string;
  dropoff: string;
  handoff: "pickup" | "courier";
  lines: { name: string; qty: number }[];
  total: number;
};

function botToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
}

function publicOrigin(): string {
  return (process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || "").replace(/\/$/, "");
}

function webhookSecret(token: string): string {
  return createHmac("sha256", token).update("expressgo-partner").digest("hex").slice(0, 32);
}

export function verifyInitData(initData: string, token: string, now = Date.now()): number | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") ?? "";
  if (!hash || !token) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const calc = createHmac("sha256", secret).update(dataCheck).digest("hex");
  const left = Buffer.from(calc);
  const right = Buffer.from(hash);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || Math.abs(now / 1000 - authDate) > 86_400) return null;
  try {
    const user = JSON.parse(params.get("user") ?? "{}") as { id?: number };
    return typeof user.id === "number" ? user.id : null;
  } catch {
    return null;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function telegram(method: string, body: unknown): Promise<void> {
  const token = botToken();
  if (!token) return;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) console.warn(`Telegram ${method} javob bermadi: ${response.status}`);
}

function kitchenMarkup(origin: string): unknown {
  if (!origin.startsWith("https://")) return undefined;
  return { inline_keyboard: [[{ text: "Oshxona", web_app: { url: `${origin}/partner` } }]] };
}

export async function notifyKitchen(info: Notice): Promise<void> {
  const chatId = kitchenChatForPhone(info.staffPhone);
  if (!chatId) return;
  const lines = info.lines.map((line) => `${line.qty}× ${line.name}`).join("\n");
  const way = info.handoff === "pickup" ? "Mijoz o'zi olib ketadi" : `Manzil: ${info.dropoff}`;
  const text = [`Yangi buyurtma`, info.placeName, lines, `Jami: ${info.total} so'm`, way, info.customerName].filter(Boolean).join("\n");
  await telegram("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: kitchenMarkup(publicOrigin()),
  });
}

async function onTelegramMessage(chatId: number, text: string, onHandled?: () => void): Promise<void> {
  const clean = text.trim();
  if (!clean || clean === "/start") {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Restoran telefonini yuboring. Masalan: 901112233",
    });
    return;
  }
  try {
    const place = linkKitchenChat(clean, chatId);
    onHandled?.();
    await telegram("sendMessage", {
      chat_id: chatId,
      text: `${place.name} ulandi. Oshxona tugmasini bosing.`,
      reply_markup: kitchenMarkup(publicOrigin()),
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Ulanmadi.";
    await telegram("sendMessage", { chat_id: chatId, text: message });
  }
}

export async function armTelegram(): Promise<void> {
  const token = botToken();
  if (!token) {
    console.warn("Telegram bot yo'q. TELEGRAM_BOT_TOKEN ni serverga qo'ying. Kalitni ilovaga yozmang.");
    return;
  }
  const origin = publicOrigin();
  if (!origin.startsWith("https://")) {
    console.warn("Telegram webhook uchun https manzil kerak. Lokalda bot ulanmaydi.");
    return;
  }
  await telegram("setWebhook", {
    url: `${origin}/telegram/webhook`,
    secret_token: webhookSecret(token),
    allowed_updates: ["message"],
  });
  await telegram("setChatMenuButton", {
    menu_button: { type: "web_app", text: "Oshxona", web_app: { url: `${origin}/partner` } },
  });
  console.log("Telegram oshxona ulandi.");
}

function partnerHtml(): string {
  return `<!doctype html>
<html lang="uz">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ExpressGo Partner</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    body { margin: 0; font-family: sans-serif; background: #f4f6fb; color: #171717; }
    header { background: #ff8a00; color: #171717; padding: 14px 16px 12px; }
    header b { font-size: 18px; }
    .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; }
    h1 { margin: 0; font-size: 20px; }
    main { padding: 12px 12px 88px; }
    .card { background: #fff; border-radius: 18px; padding: 12px; margin-bottom: 12px; }
    .tag { font-size: 12px; font-weight: 800; letter-spacing: .04em; }
    button.act { width: 100%; border: 0; border-radius: 12px; padding: 12px; font-weight: 800; margin-top: 8px; }
    .ok { background: #17803d; color: #fff; }
    .no { background: #dc2626; color: #fff; }
    .go { background: #1290f9; color: #fff; }
    .muted { color: #667085; font-size: 14px; }
    .row { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; }
    .switch { border: 0; border-radius: 999px; padding: 8px 12px; font-weight: 800; }
    .on { background: #dcfce7; color: #166534; }
    .off { background: #fee2e2; color: #991b1b; }
    nav { position: fixed; left: 0; right: 0; bottom: 0; display: flex; background: #fff; border-top: 1px solid #e4e7ec; }
    nav button { flex: 1; border: 0; background: #fff; padding: 12px 4px 16px; font-size: 12px; font-weight: 700; color: #667085; }
    nav button.here { color: #c2410c; }
  </style>
</head>
<body>
  <header>
    <b>ExpressGo Partner</b>
    <div class="top">
      <h1 id="title">Oshxona</h1>
      <button id="gate" class="switch off" type="button">Yopiq</button>
    </div>
    <p id="address" class="muted" style="margin:6px 0 0"></p>
  </header>
  <main id="app">Yuklanmoqda...</main>
  <nav>
    <button type="button" data-tab="orders">Buyurtmalar</button>
    <button type="button" data-tab="menu">Menyu</button>
    <button type="button" data-tab="report">Hisobot</button>
    <button type="button" data-tab="profile">Profil</button>
  </nav>
  <script>
    const app = document.getElementById("app");
    const title = document.getElementById("title");
    const address = document.getElementById("address");
    const gate = document.getElementById("gate");
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg) { tg.ready(); tg.expand(); }
    const initData = tg ? tg.initData : "";
    let tab = "orders";
    let latest = null;
    function money(n) { return String(Math.round(n)).replace(/\\B(?=(\\d{3})+(?!\\d))/g, " ") + " so'm"; }
    function esc(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    }
    function phoneText(digits) {
      const d = String(digits).replace(/\\D/g, "");
      if (d.length !== 12) return "+" + d;
      return "+" + d.slice(0, 3) + " " + d.slice(3, 5) + " " + d.slice(5, 8) + " " + d.slice(8, 10) + " " + d.slice(10);
    }
    function label(status) {
      if (status === "new") return "YANGI BUYURTMA";
      if (status === "sent") return "KURYERGA YUBORILDI";
      if (status === "ready") return "TAYYOR";
      return "TAYYORLANMOQDA";
    }
    function card(ticket) {
      const lines = ticket.lines.map((line) => '<div class="row"><span>' + esc(line.qty) + '× ' + esc(line.name) + '</span><span>' + money(line.qty * line.price) + '</span></div>').join("");
      const where = ticket.handoff === "pickup" ? "Mijoz o'zi olib ketadi" : esc(ticket.dropoff);
      let buttons = "";
      if (ticket.status === "new") {
        buttons = '<button class="act ok" data-act="accept" data-id="' + esc(ticket.id) + '">Qabul qilish</button><button class="act no" data-act="reject" data-id="' + esc(ticket.id) + '">Bekor qilish</button>';
      } else if (ticket.status === "accepted" || ticket.status === "preparing" || (ticket.status === "ready" && ticket.handoff !== "pickup")) {
        const caption = ticket.handoff === "pickup" ? "Tayyor, mijoz olib ketadi" : "Tayyor bo'ldi (kuryer chaqirish)";
        buttons = '<button class="act go" data-act="ready" data-id="' + esc(ticket.id) + '">' + caption + '</button>';
      }
      return '<article class="card"><div class="tag">' + label(ticket.status) + '</div>' + lines + '<div class="row"><b>Jami</b><b>' + money(ticket.foodTotal) + '</b></div><p class="muted">' + where + '<br>' + esc(ticket.customerName) + ' · ' + esc(ticket.customerPhone) + '</p>' + buttons + '</article>';
    }
    function paint() {
      if (!latest) return;
      title.textContent = latest.place.name;
      address.textContent = latest.place.address;
      gate.textContent = latest.open ? "Onlayn" : "Yopiq";
      gate.className = latest.open ? "switch on" : "switch off";
      gate.dataset.on = latest.open ? "1" : "0";
      document.querySelectorAll("nav button").forEach((button) => {
        button.className = button.dataset.tab === tab ? "here" : "";
      });
      if (tab === "menu") {
        const rows = latest.menu.map((item) => '<div class="row"><span>' + esc(item.name) + '</span><b>' + money(item.price) + '</b></div>').join("");
        app.innerHTML = '<article class="card"><div class="tag">MENYU</div>' + (rows || '<p class="muted">Menyu yo\\'q</p>') + '</article>';
        return;
      }
      if (tab === "report") {
        app.innerHTML = '<article class="card"><div class="tag">BUGUN</div><div class="row"><span>Buyurtma</span><b>' + latest.report.count + '</b></div><div class="row"><span>Jami</span><b>' + money(latest.report.total) + '</b></div><p class="muted">Bekor qilinganlar hisobga kirmaydi.</p></article>';
        return;
      }
      if (tab === "profile") {
        app.innerHTML = '<article class="card"><div class="tag">PROFIL</div><p><b>' + esc(latest.place.name) + '</b></p><p class="muted">' + esc(latest.place.address) + '</p><p>' + esc(phoneText(latest.place.phone)) + '</p><p class="muted">Onlayn yoniq bo\\'lsa mijoz zakaz yubora oladi. O\\'chiq bo\\'lsa yangi zakaz to\\'xtaydi.</p></article>';
        return;
      }
      const note = latest.note ? '<p class="muted">' + esc(latest.note) + '</p>' : "";
      const list = latest.tickets.length ? latest.tickets.map(card).join("") : '<p class="muted">Hozircha buyurtma yo\\'q</p>';
      app.innerHTML = note + list;
    }
    async function load(action, ticketId, accepting) {
      const response = await fetch("/partner/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, action, ticketId, accepting }),
      });
      const data = await response.json();
      if (!response.ok) { app.textContent = data.error || "Xato"; return; }
      latest = data;
      paint();
    }
    document.body.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.tab) { tab = button.dataset.tab; paint(); return; }
      if (button.id === "gate") { void load("open", "", button.dataset.on !== "1"); return; }
      if (button.dataset.act) void load(button.dataset.act, button.dataset.id);
    });
    if (!initData) app.textContent = "Oshxonani Telegram bot ichida oching.";
    else void load();
    setInterval(() => { if (initData) void load(); }, 8000);
  </script>
</body>
</html>`;
}

export async function handlePartner(req: IncomingMessage, res: ServerResponse, onHandled?: () => void): Promise<boolean> {
  const path = (req.url ?? "").split("?")[0];
  if (req.method === "GET" && path === "/partner") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(partnerHtml());
    return true;
  }
  if (req.method === "POST" && path === "/telegram/webhook") {
    const token = botToken();
    const secret = req.headers["x-telegram-bot-api-secret-token"];
    const given = Array.isArray(secret) ? secret[0] : secret;
    if (!token || given !== webhookSecret(token)) {
      res.writeHead(401);
      res.end();
      return true;
    }
    try {
      const update = JSON.parse((await readBody(req)) || "{}") as {
        message?: { chat?: { id?: number }; text?: string; contact?: { phone_number?: string } };
      };
      const chatId = update.message?.chat?.id;
      const text = update.message?.contact?.phone_number || update.message?.text || "";
      if (chatId) await onTelegramMessage(chatId, text, onHandled);
    } catch {
      console.warn("Telegram xabari o'qilmadi.");
    }
    res.writeHead(200);
    res.end("ok");
    return true;
  }
  if (req.method === "POST" && path === "/partner/api") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}") as { initData?: string; action?: string; ticketId?: string; accepting?: boolean };
      const chatId = verifyInitData(body.initData ?? "", botToken());
      const phone = chatId == null ? null : kitchenPhoneForChat(chatId);
      if (!phone) {
        res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Avval botga restoran telefonini yuboring." }));
        return true;
      }
      const place = kitchenByPhone(phone);
      if (!place) {
        res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Bu telefon restoranga tegishli emas." }));
        return true;
      }
      let note = "";
      if (body.action === "accept" || body.action === "reject" || body.action === "ready") {
        const step = await kitchenStep(phone, body.ticketId ?? "", body.action);
        note = step.note;
        onHandled?.();
      }
      if (body.action === "open") {
        setKitchenOpen(phone, body.accepting === true);
        onHandled?.();
      }
      const tickets = listKitchenForPhone(phone);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        place,
        open: foodPlaceOpen(place.id),
        tickets,
        menu: kitchenMenu(place.id),
        report: kitchenReport(phone),
        note,
      }));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Xato";
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: message }));
    }
    return true;
  }
  return false;
}
