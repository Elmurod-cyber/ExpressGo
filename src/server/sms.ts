const inbox = new Map<string, string>();

function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function otpConfigured(): "dev" | "eskiz" | "webhook" | "off" {
  if (process.env.EG_OTP_DEV === "1") return "dev";
  if (process.env.ESKIZ_EMAIL?.trim() && process.env.ESKIZ_SECRET?.trim()) return "eskiz";
  if (process.env.SMS_WEBHOOK_URL?.trim()) return "webhook";
  return "off";
}

export const SMS_TEST_CODE = "1234";

/** Eskiz shartnomasi yo'q. ESKIZ_LIVE=1 bo'lmaguncha SMS ketmaydi, kod 1234. */
export function smsTestMode(): boolean {
  if (process.env.EG_OTP_DEV === "1") return false;
  return process.env.ESKIZ_LIVE !== "1";
}

function maskPhone(phone: string): string {
  const value = digits(phone);
  if (value.length < 6) return "***";
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

/** Haqiqiy SMS yo'q. Sinov rejimi alohida: EG_OTP_DEV=1. Kod javobga yozilmaydi. */
export async function sendLoginCode(phone: string, code: string): Promise<void> {
  const mode = otpConfigured();
  if (mode === "off") {
    throw new Error("SMS sozlanmagan. Kirish kodi yuborilmadi.");
  }
  if (mode === "dev") {
    inbox.set(digits(phone), code);
    console.log(`[Express Go][otp-dev] ${maskPhone(phone)} uchun sinov kodi saqlandi. Bu SMS emas.`);
    return;
  }
  if (mode === "eskiz") {
    await sendEskiz(digits(phone), code);
    return;
  }
  const url = process.env.SMS_WEBHOOK_URL?.trim() ?? "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.SMS_WEBHOOK_TOKEN?.trim();
  if (secret) headers.Authorization = `Bearer ${secret}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: digits(phone), code }),
  });
  if (!response.ok) {
    throw new Error("SMS yuborilmadi.");
  }
}

const ESKIZ_LOGIN = "https://notify.eskiz.uz/api/auth/login";
const ESKIZ_SEND = "https://notify.eskiz.uz/api/message/sms/send";

let eskizToken = "";
let eskizTokenUntil = 0;

async function eskizAccessToken(force: boolean): Promise<string> {
  if (!force && eskizToken && eskizTokenUntil > Date.now()) return eskizToken;
  const email = process.env.ESKIZ_EMAIL?.trim() ?? "";
  const secret = process.env.ESKIZ_SECRET?.trim() ?? "";
  const response = await fetch(ESKIZ_LOGIN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password: secret }),
  });
  const payload = (await response.json().catch(() => null)) as { data?: { token?: string } } | null;
  const token = payload?.data?.token?.trim() ?? "";
  if (!response.ok || !token) throw new Error("SMS yuborilmadi.");
  eskizToken = token;
  eskizTokenUntil = Date.now() + 20 * 24 * 60 * 60 * 1000;
  return token;
}

async function sendEskiz(phone: string, code: string): Promise<void> {
  const from = process.env.ESKIZ_FROM?.trim() || "4546";
  const message = `Express Go kirish kodi: ${code}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await eskizAccessToken(attempt > 0);
    const response = await fetch(ESKIZ_SEND, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ mobile_phone: phone, message, from }),
    });
    if (response.status === 401 && attempt === 0) {
      eskizToken = "";
      eskizTokenUntil = 0;
      continue;
    }
    if (!response.ok) throw new Error("SMS yuborilmadi.");
    return;
  }
  throw new Error("SMS yuborilmadi.");
}

/** Faqat EG_OTP_DEV=1. HTTP javobiga chiqarilmaydi. */
export function readDevOtp(phone: string): string | null {
  if (process.env.EG_OTP_DEV !== "1") return null;
  return inbox.get(digits(phone)) ?? null;
}
