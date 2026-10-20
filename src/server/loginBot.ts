import { createHmac } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { attachLoginChat, confirmLoginContact } from "./deliveryService";

function botToken(): string {
  return process.env.TELEGRAM_LOGIN_BOT_TOKEN?.trim() ?? "";
}

function publicOrigin(): string {
  return (process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || "").replace(/\/$/, "");
}

function webhookSecret(token: string): string {
  return createHmac("sha256", token).update("expressgo-login").digest("hex").slice(0, 32);
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
  if (!response.ok) console.warn(`Kirish boti ${method} javob bermadi: ${response.status}`);
}

const shareKeyboard = {
  keyboard: [[{ text: "Raqamimni yuborish", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

export async function armLoginBot(): Promise<void> {
  const token = botToken();
  if (!token) return;
  const origin = publicOrigin();
  if (!origin.startsWith("https://")) {
    console.warn("Kirish boti uchun https manzil kerak.");
    return;
  }
  await telegram("setWebhook", {
    url: `${origin}/telegram/login`,
    secret_token: webhookSecret(token),
    allowed_updates: ["message"],
  });
  console.log("Telegram kirish boti ulandi.");
}

type LoginMessage = {
  chat?: { id?: number };
  from?: { id?: number };
  text?: string;
  contact?: { phone_number?: string; user_id?: number };
};

export async function handleLoginBot(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = (req.url ?? "").split("?")[0];
  if (req.method !== "POST" || path !== "/telegram/login") return false;
  const token = botToken();
  const secret = req.headers["x-telegram-bot-api-secret-token"];
  const given = Array.isArray(secret) ? secret[0] : secret;
  if (!token || given !== webhookSecret(token)) {
    res.writeHead(401);
    res.end();
    return true;
  }
  try {
    const update = JSON.parse((await readBody(req)) || "{}") as { message?: LoginMessage };
    const message = update.message;
    const chatId = message?.chat?.id;
    if (chatId) await onLoginMessage(chatId, message ?? {});
  } catch {
    console.warn("Kirish boti xabari o'qilmadi.");
  }
  res.writeHead(200);
  res.end("ok");
  return true;
}

async function onLoginMessage(chatId: number, message: LoginMessage): Promise<void> {
  const contact = message.contact?.phone_number?.trim();
  if (contact) {
    const own = message.contact?.user_id != null && message.contact.user_id === message.from?.id;
    const result = await confirmLoginContact(chatId, contact, own);
    const text =
      result === "ok"
        ? "Raqam tasdiqlandi. Ilovaga qayting."
        : result === "mismatch"
          ? "Bu raqam ilovada yozilgan raqam emas. Ilovadagi telefon bilan shu tugmani bosing."
          : "Avval ilovadagi Telegram tugmasini bosing.";
    await telegram("sendMessage", { chat_id: chatId, text, reply_markup: { remove_keyboard: true } });
    return;
  }
  const text = message.text?.trim() ?? "";
  const start = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9]+))?$/.exec(text);
  if (!start) {
    await telegram("sendMessage", { chat_id: chatId, text: "Raqamni tasdiqlash uchun Express Go ilovasidagi tugmani bosing." });
    return;
  }
  const id = start[1] ?? "";
  if (!id || !(await attachLoginChat(id, chatId))) {
    await telegram("sendMessage", { chat_id: chatId, text: "Bu tasdiqlash eskirgan. Ilovada qaytadan boshlang." });
    return;
  }
  await telegram("sendMessage", {
    chat_id: chatId,
    text: "Pastdagi tugma bilan o'z raqamingizni yuboring. Qo'lda yozilgan raqam qabul qilinmaydi.",
    reply_markup: shareKeyboard,
  });
}
