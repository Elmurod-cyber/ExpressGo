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
