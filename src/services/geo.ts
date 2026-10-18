import * as Location from "expo-location";
import type { MapPoint } from "./distance";
import { kmBetween } from "./distance";
import { PLACES } from "../server/places";
import { listCustomLocations, noteCustomLocation } from "../server/store";
import { scheduleStoreSave } from "../server/persist";

export type { MapPoint } from "./distance";
export { kmBetween } from "./distance";

export type FoundPlace = {
  point: MapPoint;
  label: string;
};

export const SHAHRIXON: MapPoint = { lat: 40.71331, lng: 72.05706 };

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  "Accept-Language": "uz",
  "User-Agent": "ExpressGo/1.0 (Shahrixon courier)",
};

const KNOWN_PLACES: { keys: string[]; label: string; point: MapPoint }[] = [
  { keys: ["shahrixon"], label: "Shahrixon", point: SHAHRIXON },
  { keys: ["orta shahrixon"], label: "O'rta Shahrixon", point: SHAHRIXON },
  { keys: ["yuqori shahrixon"], label: "Yuqori Shahrixon", point: SHAHRIXON },
  { keys: ["qorgoncha", "kurgoncha"], label: "Qo'rg'oncha", point: { lat: 40.7014006, lng: 71.9969594 } },
  { keys: ["choja", "chuja"], label: "Cho'ja", point: { lat: 40.6565571, lng: 72.0825863 } },
  { keys: ["segaza"], label: "Segaza", point: { lat: 40.7115863, lng: 72.1646405 } },
  { keys: ["abdubiy"], label: "Abdubiy", point: { lat: 40.7552571, lng: 71.9817553 } },
  { keys: ["nazarmahram", "nazarmaxram"], label: "Nazarmahram", point: { lat: 40.6707586, lng: 72.0656238 } },
  { keys: ["naynavo", "yangi naynavo", "yangi-naynavo"], label: "Naynavo", point: { lat: 40.6329413, lng: 72.0809507 } },
  { keys: ["toshtepa"], label: "Toshtepa", point: { lat: 40.665274, lng: 72.1622265 } },
  { keys: ["guliston"], label: "Guliston", point: { lat: 40.7762366, lng: 72.1223903 } },
  { keys: ["eshonqishloq", "eshonkishlok"], label: "Eshonqishloq", point: { lat: 40.8292935, lng: 71.8231821 } },
  { keys: ["yangiyol", "yangiyul"], label: "Yangiyo'l", point: { lat: 40.6622292, lng: 72.1114603 } },
  { keys: ["vaxim"], label: "Vaxim", point: { lat: 40.7340755, lng: 72.0503022 } },
  { keys: ["dorilomon", "dorilamon"], label: "Dorilomon", point: { lat: 40.7352278, lng: 71.9685173 } },
  { keys: ["chorsu", "chorsu bozor", "chorsu bozori"], label: "Chorsu bozori", point: { lat: 41.3265, lng: 69.2352 } },
  { keys: ["toshkent vokzal", "toshkent vokzali", "shimoliy vokzal"], label: "Toshkent vokzali", point: { lat: 41.2916, lng: 69.2873 } },
  { keys: ["andijon vokzal", "andijon vokzali"], label: "Andijon vokzali", point: { lat: 40.7605, lng: 72.351 } },
  { keys: ["qoqon bozor", "qoqon bozori", "kokand bozor"], label: "Qo'qon bozori", point: { lat: 40.5305, lng: 70.942 } },
  { keys: ["shahrixon bozor", "shahrixon bozori"], label: "Shahrixon bozori", point: { lat: 40.7118, lng: 72.0555 } },
  { keys: ["asaka bozor", "asaka bozori"], label: "Asaka bozori", point: { lat: 40.641, lng: 72.236 } },
];

function foldName(value: string): string {
  return value
    .toLowerCase()
    .replace(/['`\u02BB\u02BC\u2018\u2019]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inUzbekistan(point: MapPoint): boolean {
  return point.lat >= 37 && point.lat <= 46 && point.lng >= 55 && point.lng <= 74;
}

function catalogPlaces() {
  return [
    ...KNOWN_PLACES,
    ...PLACES.map((place) => ({
      keys: [foldName(place.name), foldName(place.region + " " + place.name)],
      label: place.name,
      point: { lat: place.lat, lng: place.lng },
    })),
  ];
}

function rankCatalog(query: string): FoundPlace[] {
  const folded = foldName(query);
  if (folded.length < 2) return [];
  const scored: { place: FoundPlace; score: number }[] = [];
  for (const place of catalogPlaces()) {
    let score = 0;
    for (const key of place.keys) {
      let next = 0;
      if (folded === key) next = 1000 + key.length;
      else if (key.startsWith(folded) && folded.length >= 2) next = 500 + folded.length;
      else if (key.includes(folded) && folded.length >= 3) next = 200 + folded.length;
      else if (folded.includes(key) && key.length >= 4) next = 180 + key.length;
      if (next > score) score = next;
    }
    if (score > 0) scored.push({ place: { point: place.point, label: place.label }, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: FoundPlace[] = [];
  for (const row of scored) {
    const id = foldName(row.place.label);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row.place);
    if (out.length >= 3) break;
  }
  return out;
}

function isCatalogLabel(label: string): boolean {
  const folded = foldName(label);
  return catalogPlaces().some((place) => foldName(place.label) === folded || place.keys.includes(folded));
}

type NominatimHit = {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
};

function rankNominatim(rows: NominatimHit[], query: string, bias?: MapPoint | null): FoundPlace[] {
  const folded = foldName(query);
  const scored = rows
    .map((row) => {
      const point = { lat: Number(row.lat), lng: Number(row.lon) };
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || !inUzbekistan(point)) return null;
      const name = row.name || row.display_name || query;
      const nameFold = foldName(name);
      const exact = nameFold === folded || nameFold.includes(folded) || folded.includes(nameFold);
      const km = bias ? kmBetween(point, bias) : 0;
      return { point, label: name, km, exact };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || a.km - b.km);
  const out: FoundPlace[] = [];
  for (const hit of scored) {
    if (out.some((item) => kmBetween(item.point, hit.point) < 0.15)) continue;
    out.push({ point: hit.point, label: hit.label });
    if (out.length >= 6) break;
  }
  return out;
}

async function nominatimHits(query: string, bias?: MapPoint | null, bounded = false): Promise<FoundPlace[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    countrycodes: "uz",
    limit: "6",
    q: query,
  });
  if (bias) {
    const span = bounded ? 0.25 : 0.6;
    params.set("viewbox", `${bias.lng - span},${bias.lat + span},${bias.lng + span},${bias.lat - span}`);
    if (bounded) params.set("bounded", "1");
  }
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: NOMINATIM_HEADERS,
  });
  if (!response.ok) return [];
  const rows = (await response.json()) as NominatimHit[];
  return rankNominatim(Array.isArray(rows) ? rows : [], query, bias);
}

async function deviceGeocode(query: string): Promise<FoundPlace | null> {
  try {
    const rows = await Location.geocodeAsync(`${query}, O'zbekiston`);
    const hit = rows.find((row) => inUzbekistan({ lat: row.latitude, lng: row.longitude }));
    if (!hit) return null;
    return { point: { lat: hit.latitude, lng: hit.longitude }, label: query };
  } catch {
    return null;
  }
}

function rememberPlace(name: string, point: MapPoint) {
  if (noteCustomLocation(name, point)) scheduleStoreSave();
}

export type PlaceSource = "own" | "map";

export type PlaceHit = {
  point: MapPoint;
  label: string;
  source: PlaceSource;
  km?: number | null;
};

function alreadyListed(rows: PlaceHit[], point: MapPoint, label: string): boolean {
  const folded = foldName(label);
  return rows.some((row) => foldName(row.label) === folded || kmBetween(row.point, point) < 0.15);
}

/** Yetkazish taklifi: olish nuqtasidan shu masofadagi xotira joylari yuqoriga chiqadi. */
const DROP_NEAR_KM = 25;

/** O'z joylar yuqorida, xarita natijalari pastda. Qidiruvning o'zi hisobni oshirmaydi. */
export async function searchPlaces(query: string, bias?: MapPoint | null, nearby = false): Promise<PlaceHit[]> {
  const text = query.trim();
  if (text.length < 2) return [];
  const saved = listCustomLocations(text, nearby ? 12 : 4).map((place) => ({
    ...place,
    km: bias ? kmBetween(place.point, bias) : null,
  }));
  const ranked = nearby && bias
    ? [...saved].sort((a, b) => {
        const aNear = (a.km ?? 999) <= DROP_NEAR_KM ? 0 : 1;
        const bNear = (b.km ?? 999) <= DROP_NEAR_KM ? 0 : 1;
        return aNear - bNear || (a.km ?? 999) - (b.km ?? 999);
      })
    : saved;
  const own: PlaceHit[] = [];
  for (const place of ranked) {
    if (own.length >= 4 || alreadyListed(own, place.point, place.label)) continue;
    own.push({ point: place.point, label: place.label, source: "own", km: place.km });
  }
  const remoteTask = (async () => {
    try {
      const near = bias ? await nominatimHits(text, bias, nearby) : [];
      if (near.length > 0) return near;
      return await nominatimHits(text, null);
    } catch {
      return [];
    }
  })();
  const map: PlaceHit[] = [];
  for (const place of rankCatalog(text)) {
    const km = bias ? kmBetween(place.point, bias) : null;
    if (nearby && bias && (km ?? 999) > DROP_NEAR_KM) continue;
    if (map.length >= 3 || alreadyListed(own, place.point, place.label) || alreadyListed(map, place.point, place.label)) continue;
    map.push({ point: place.point, label: place.label, source: "map", km });
  }
  for (const place of await remoteTask) {
    if (alreadyListed(own, place.point, place.label) || alreadyListed(map, place.point, place.label)) continue;
    map.push({
      point: place.point,
      label: place.label,
      source: "map",
      km: bias ? kmBetween(place.point, bias) : null,
    });
  }
  return [...own, ...map].slice(0, 8);
}

export function keepFoundPlace(hit: PlaceHit) {
  if (hit.source !== "own" && isCatalogLabel(hit.label)) return;
  rememberPlace(hit.label, hit.point);
}

export async function findPlace(query: string, bias?: MapPoint | null): Promise<FoundPlace | null> {
  const text = query.trim();
  if (text.length < 2) return null;
  const top = (await searchPlaces(text, bias))[0];
  if (top) {
    keepFoundPlace(top);
    return { point: top.point, label: top.label };
  }
  const device = await deviceGeocode(text);
  if (device) rememberPlace(device.label, device.point);
  return device;
}

export async function describePoint(point: MapPoint): Promise<string> {
  const label = await describePointLabel(point);
  if (!label.startsWith("Tanlangan nuqta")) rememberPlace(label, point);
  return label;
}

function placePart(value?: string | null): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text || /^[+-]?\d+(\.\d+)?$/.test(text)) return "";
  if (/^[23456789CFGHJMPQRVWX]{4,}\+/i.test(text)) return "";
  return text;
}

function shortAddress(street?: string | null, area?: string | null): string {
  const road = placePart(street);
  const mahalla = placePart(area);
  if (road && mahalla && foldName(road) !== foldName(mahalla)) return `${road}, ${mahalla}`;
  return road || mahalla;
}

async function nominatimShort(point: MapPoint): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=uz&lat=${point.lat}&lon=${point.lng}`;
  const response = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!response.ok) return "";
  const data = (await response.json()) as { address?: Record<string, string> };
  const address = data.address;
  const street = address?.road || address?.pedestrian || address?.footway;
  const area =
    address?.suburb ||
    address?.neighbourhood ||
    address?.quarter ||
    address?.city_district ||
    address?.residential ||
    address?.village ||
    address?.hamlet;
  return shortAddress(street, area);
}

function namedAddress(district: string, street: string): string {
  if (district && street && foldName(district) !== foldName(street)) return `${district}, ${street}`;
  return district || street;
}

async function deviceShort(point: MapPoint): Promise<string> {
  const rows = await Location.reverseGeocodeAsync({
    latitude: point.lat,
    longitude: point.lng,
  });
  const row = rows[0];
  if (!row) return "";
  const street = [placePart(row.street) || placePart(row.name), placePart(row.streetNumber)].filter(Boolean).join(" ");
  const district = placePart(row.district) || placePart(row.subregion) || placePart(row.city);
  const label = namedAddress(district, street);
  if (label) return label;
  return placePart(row.formattedAddress);
}

async function describePointLabel(point: MapPoint): Promise<string> {
  try {
    const label = await deviceShort(point);
    if (label) return label;
  } catch {
    // Webda yoki ruxsatsiz teskari geokod yo'q.
  }
  try {
    const label = await nominatimShort(point);
    if (label) return label;
  } catch {
    // Tarmoq yoki CORS.
  }
  return `Tanlangan nuqta (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`;
}
