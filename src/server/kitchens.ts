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

const MENUS: Record<string, { name: string; price: number }[]> = {
  shahrixon: [
    { name: "Lavash", price: 28000 },
    { name: "Burger", price: 35000 },
    { name: "Donar", price: 32000 },
    { name: "Kartoshka fri", price: 15000 },
    { name: "Hot-dog", price: 18000 },
  ],
  andijon: [
    { name: "Osh", price: 25000 },
    { name: "Somsa", price: 8000 },
    { name: "Shashlik", price: 35000 },
    { name: "Lag'mon", price: 28000 },
    { name: "Manti", price: 22000 },
  ],
};

export function kitchenMenu(placeId: string): { name: string; price: number }[] {
  return (MENUS[placeId] ?? []).map((item) => ({ ...item }));
}

export function kitchenDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9) return `998${digits}`;
  return digits;
}

export function kitchenByPhone(phone: string): (typeof KITCHENS)[number] | null {
  const digits = kitchenDigits(phone);
  return KITCHENS.find((item) => item.phone === digits) ?? null;
}
