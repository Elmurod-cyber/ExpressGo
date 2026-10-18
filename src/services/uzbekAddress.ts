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
