const PLACE_FIXES: [RegExp, string][] = [
  [/шахрихан\p{L}*/giu, "Shahrixon"],
  [/андижан\p{L}*/giu, "Andijon"],
  [/ташкент\p{L}*/giu, "Toshkent"],
  [/ферган\p{L}*/giu, "Farg'ona"],
  [/наманган\p{L}*/giu, "Namangan"],
  [/маргилан\p{L}*/giu, "Marg'ilon"],
  [/коканд\p{L}*/giu, "Qo'qon"],
  [/асака\p{L}*/giu, "Asaka"],
  [/узбекистан\p{L}*/giu, "O'zbekiston"],
  [/амира темура/giu, "Amir Temur"],
  [/мустакиллик/giu, "Mustaqillik"],
  [/shahrikhan\p{L}*/giu, "Shahrixon"],
  [/andijan\p{L}*/giu, "Andijon"],
  [/tashkent\p{L}*/giu, "Toshkent"],
  [/fergana\p{L}*/giu, "Farg'ona"],
  [/kokand\p{L}*/giu, "Qo'qon"],
  [/margilan\p{L}*/giu, "Marg'ilon"],
  [/uzbekistan\p{L}*/giu, "O'zbekiston"],
];

const ADDRESS_FIXES: [RegExp, string][] = [
  [/область/giu, "viloyati"],
  [/район/giu, "tumani"],
  [/проспект/giu, "shoh ko'chasi"],
  [/переулок/giu, "tor ko'chasi"],
  [/улица/giu, "ko'chasi"],
  [/ул\./giu, "ko'chasi"],
  [/махалля/giu, "mahalla"],
  [/кишлак/giu, "qishloq"],
  [/город/giu, ""],
  [/\bstreet\b/gi, "ko'chasi"],
  [/\bavenue\b/gi, "shoh ko'chasi"],
  [/\bdistrict\b/gi, "tumani"],
  [/\bregion\b/gi, "viloyati"],
  [/\bprovince\b/gi, "viloyati"],
];

const CYRILLIC_LETTERS: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "x", ц: "s", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o'", қ: "q", ғ: "g'", ҳ: "h",
};

export function hasCyrillic(value: string): boolean {
  return /[\u0400-\u04FF]/.test(value);
}

const LATIN_TO_CYR: Record<string, string> = {
  a: "а", b: "б", d: "д", e: "е", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж",
  k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "қ", r: "р", s: "с",
  t: "т", u: "у", v: "в", x: "х", y: "й", z: "з",
};

function transliterate(value: string): string {
  let out = "";
  for (const ch of value) {
    const mapped = CYRILLIC_LETTERS[ch.toLowerCase()];
    if (mapped == null) {
      out += ch;
      continue;
    }
    out += ch === ch.toLowerCase() ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
  }
  return out;
}

function toCyrillic(value: string): string {
  const text = value.toLowerCase();
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const three = text.slice(i, i + 2);
    const pair = text.slice(i, i + 2);
    if (three === "o'" || three === "o‘" || three === "o’" || three === "oʻ" || three === "o`") {
      out += "ў";
      i += 1;
      continue;
    }
    if (three === "g'" || three === "g‘" || three === "g’" || three === "gʻ" || three === "g`") {
      out += "ғ";
      i += 1;
      continue;
    }
    if (pair === "sh") {
      out += "ш";
      i += 1;
      continue;
    }
    if (pair === "ch") {
      out += "ч";
      i += 1;
      continue;
    }
    if (pair === "yo") {
      out += "ё";
      i += 1;
      continue;
    }
    if (pair === "yu") {
      out += "ю";
      i += 1;
      continue;
    }
    if (pair === "ya") {
      out += "я";
      i += 1;
      continue;
    }
    const ch = text[i] ?? "";
    if (ch === "'" || ch === "‘" || ch === "’" || ch === "`") continue;
    out += LATIN_TO_CYR[ch] ?? ch;
  }
  return out;
}

/** Qidiruv kaliti: kirill va lotin bitta yozuvga tushadi. */
export function latinKey(value: string): string {
  return transliterate(value)
    .toLowerCase()
    .replace(/['`\u02BB\u02BC\u2018\u2019]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nominatimga ketadigan ikki yozuv: lotin va kirill. */
export function addressQueries(value: string): string[] {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < 2) return [];
  const latin = transliterate(text).replace(/\s+/g, " ").trim();
  const cyrillic = hasCyrillic(text) ? text : toCyrillic(latin);
  const rows = hasCyrillic(text) ? [text, latin] : [latin, cyrillic];
  const out: string[] = [];
  for (const row of rows) {
    if (row.length < 2) continue;
    if (out.some((item) => item.toLowerCase() === row.toLowerCase())) continue;
    out.push(row);
  }
  return out;
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > 2) return 3;
  const prev = new Array<number>(right.length + 1);
  const next = new Array<number>(right.length + 1);
  for (let col = 0; col <= right.length; col += 1) prev[col] = col;
  for (let row = 1; row <= left.length; row += 1) {
    next[0] = row;
    let best = next[0];
    for (let col = 1; col <= right.length; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      next[col] = Math.min(prev[col] + 1, next[col - 1] + 1, prev[col - 1] + cost);
      if (next[col] < best) best = next[col];
    }
    if (best > 2) return 3;
    for (let col = 0; col <= right.length; col += 1) prev[col] = next[col];
  }
  return prev[right.length] ?? 3;
}

/** Aniq moslik yuqori, 1-2 harf xatosi pastda, lekin baribir chiqadi. */
export function addressScore(queryKey: string, nameKey: string): number {
  if (queryKey.length < 2 || nameKey.length < 2) return 0;
  if (queryKey === nameKey) return 1000 + nameKey.length;
  if (nameKey.startsWith(queryKey)) return 500 + queryKey.length;
  if (nameKey.includes(queryKey) && queryKey.length >= 3) return 200 + queryKey.length;
  if (queryKey.includes(nameKey) && nameKey.length >= 4) return 180 + nameKey.length;
  const words = queryKey.split(" ").filter((word) => word.length >= 4);
  const targets = [nameKey, ...nameKey.split(" ").filter((word) => word.length >= 4)];
  let best = 0;
  for (const word of words.length > 0 ? words : [queryKey]) {
    if (word.length < 4) continue;
    for (const target of targets) {
      const allow = word.length >= 8 ? 2 : 1;
      const dist = editDistance(word, target);
      if (dist > 0 && dist <= allow) best = Math.max(best, 140 - dist * 30);
    }
  }
  return best;
}

/** Telefon geokoderi ruscha yoki inglizcha qaytarsa, manzilni o'zbekcha yozuvga o'tkazadi. */
export function addressInUzbek(value: string): string {
  let text = value;
  for (const [pattern, replacement] of PLACE_FIXES) text = text.replace(pattern, replacement);
  for (const [pattern, replacement] of ADDRESS_FIXES) text = text.replace(pattern, replacement);
  text = transliterate(text);
  text = text.replace(/shoh ko'chasi\s+([^,]+)/gi, "$1 shoh ko'chasi");
  text = text.replace(/(^|,\s*)ko'chasi\s+([^,]+)/gi, "$1$2 ko'chasi");
  return text.replace(/\s+/g, " ").replace(/\s+,/g, ",").replace(/,\s*,/g, ",").trim().replace(/^,|,$/g, "").trim();
}
