const inbox = new Map<string, string>();

function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function otpConfigured(): "dev" | "webhook" | "off" {
  if (process.env.EG_OTP_DEV === "1") return "dev";
  if (process.env.SMS_WEBHOOK_URL?.trim()) return "webhook";
  return "off";
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

/** Faqat EG_OTP_DEV=1. HTTP javobiga chiqarilmaydi. */
export function readDevOtp(phone: string): string | null {
  if (process.env.EG_OTP_DEV !== "1") return null;
  return inbox.get(digits(phone)) ?? null;
}
