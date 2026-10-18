/** Restoran telefonlari ilovada ochiq ko'rsatiladi. Telegram shu raqamga ulanadi. */
export const KITCHENS = [
  {
    id: "shahrixon",
    name: "Shahrixon Fastfood",
    phone: "998902223377",
    address: "Shahrixon shahri, Asaka ko'chasi, 6-uy",
  },
  {
    id: "andijon",
    name: "Andijon taomomasi",
    phone: "998913334488",
    address: "Andijon shahri, Bobur shoh ko'chasi, 12-uy",
  },
] as const;

export function kitchenDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9) return `998${digits}`;
  return digits;
}

export function kitchenByPhone(phone: string): (typeof KITCHENS)[number] | null {
  const digits = kitchenDigits(phone);
  return KITCHENS.find((item) => item.phone === digits) ?? null;
}
