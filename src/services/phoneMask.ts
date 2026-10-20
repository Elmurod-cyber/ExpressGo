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
const CARD_HOLE = "·";

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

export function cardPhoneCaret(count: number): { start: number; end: number } {
  if (count >= 9) return { start: 19, end: 19 };
  const at = CARD_SLOTS[count] ?? 6;
  return { start: at, end: at + 1 };
}

/** Birinchi nol yozilsa tushib ketadi. Keyingi nollar raqam sifatida qoladi. */
export function cardPhoneApply(prevDigits: string, nextText: string): string {
  const prev = cardPhoneValue(prevDigits);
  const current = prevDigits.replace(/\D/g, "").slice(0, 9);
  if (nextText === prev) return current;
  if (nextText.length < prev.length) return current.slice(0, -1);
  if (nextText.length === prev.length) {
    let index = 0;
    while (index < prev.length && prev[index] === nextText[index]) index += 1;
    const ch = nextText[index] ?? "";
    if (!/\d/.test(ch)) return current;
    if (ch === "0" && current.length === 0) return "";
    return (current + ch).slice(0, 9);
  }
  let index = 0;
  while (index < prev.length && index < nextText.length && prev[index] === nextText[index]) index += 1;
  const added = nextText.slice(index, index + (nextText.length - prev.length)).replace(/\D/g, "");
  const merged = current.length === 0 ? added.replace(/^0+/, "") : current + added;
  return merged.slice(0, 9);
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
