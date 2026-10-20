/** Kiritish: +998, keyin operator qavsda. Yulduz va chiziq chiqmaydi. */

export function formatUzPhone(raw: string): string {
  const digits = localDigits(raw);
  if (digits.length === 0) return "+998 ";
  if (digits.length === 1) return `+998 (${digits}`;
  const op = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (!rest) return `+998 (${op})`;
  return `+998 (${op}) ${rest}`;
}

export function editUzPhone(next: string, prev: string): string {
  const prevDigits = localDigits(prev);
  const nextDigits = localDigits(next);
  if (next.length < prev.length && nextDigits.length >= prevDigits.length) {
    return formatUzPhone(prevDigits.slice(0, -1));
  }
  return formatUzPhone(nextDigits);
}

const CARD_SLOTS = [6, 7, 10, 11, 12, 14, 15, 17, 18];
const CARD_HOLE = "\u2007";

function cardSlots(digits: string, hole: string): string {
  const slots = hole.repeat(9).split("");
  const clean = digits.replace(/\D/g, "").slice(0, 9);
  for (let i = 0; i < clean.length; i += 1) slots[i] = clean[i];
  return `+998 (${slots[0]}${slots[1]}) ${slots[2]}${slots[3]}${slots[4]}-${slots[5]}${slots[6]}-${slots[7]}${slots[8]}`;
}

/** Maydondagi qiymat. Bo'sh joy nuqta, shuning uchun yozilgan nol ajralib turadi. */
export function cardPhoneValue(digits: string): string {
  return cardSlots(digits, CARD_HOLE);
}

/** Ekranda ko'rinadigan holat: +998 (00) 000-00-00. */
export function cardPhoneMask(digits: string): string {
  return cardSlots(digits, "0");
}

export function cardPhoneCaretAt(slot: number): { start: number; end: number } {
  if (slot >= 9) return { start: 19, end: 19 };
  const at = CARD_SLOTS[Math.max(0, slot)] ?? 6;
  return { start: at, end: at };
}

export function cardSlotAt(charIndex: number): number {
  if (charIndex >= 19) return 9;
  for (let i = 0; i < CARD_SLOTS.length; i += 1) {
    if (charIndex <= CARD_SLOTS[i]) return i;
  }
  return 9;
}

/** Birinchi nol yozilsa tushib ketadi. Keyingi nollar raqam sifatida qoladi. Kursor berilgan joyda qoladi. */
export function cardPhoneApplyAt(prevDigits: string, nextText: string, slot: number): { digits: string; slot: number } {
  const prev = cardPhoneValue(prevDigits);
  const current = prevDigits.replace(/\D/g, "").slice(0, 9);
  const at = Math.min(Math.max(slot, 0), current.length);
  if (nextText === prev) return { digits: current, slot: at };
  if (nextText.length < prev.length) {
    if (at === 0) return { digits: current, slot: 0 };
    return { digits: current.slice(0, at - 1) + current.slice(at), slot: at - 1 };
  }
  if (nextText.length === prev.length) {
    let index = 0;
    while (index < prev.length && prev[index] === nextText[index]) index += 1;
    const ch = nextText[index] ?? "";
    if (!/\d/.test(ch)) return { digits: current, slot: at };
    if (ch === "0" && current.length === 0) return { digits: "", slot: 0 };
    if (at < current.length) {
      return { digits: current.slice(0, at) + ch + current.slice(at + 1), slot: Math.min(at + 1, 9) };
    }
    const appended = (current + ch).slice(0, 9);
    return { digits: appended, slot: Math.min(at + 1, appended.length) };
  }
  let index = 0;
  while (index < prev.length && index < nextText.length && prev[index] === nextText[index]) index += 1;
  const added = nextText.slice(index, index + (nextText.length - prev.length)).replace(/\D/g, "");
  const clean = current.length === 0 ? added.replace(/^0+/, "") : added;
  if (!clean) return { digits: current, slot: at };
  const next = (current.slice(0, at) + clean + current.slice(at)).slice(0, 9);
  return { digits: next, slot: Math.min(at + clean.length, next.length) };
}

function localDigits(raw: string): string {
  const cleaned = raw.replace(/\*/g, "");
  const plus = cleaned.indexOf("+998");
  if (plus >= 0) {
    const before = cleaned.slice(0, plus).replace(/\D/g, "");
    const after = cleaned.slice(plus + 4).replace(/\D/g, "");
    return (after + before).slice(0, 9);
  }
  let digits = cleaned.replace(/\D/g, "");
  if (digits.startsWith("998")) digits = digits.slice(3);
  return digits.slice(0, 9);
}
