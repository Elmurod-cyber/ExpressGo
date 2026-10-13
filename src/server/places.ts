import { kmBetween, type MapPoint } from "../services/distance";

export type Place = {
  id: string;
  region: string;
  name: string;
  lat: number;
  lng: number;
};

/** Shahar markazlari. Tuman chegarasi PostGIS'da keyin keladi. */
export const PLACES: Place[] = [
  { id: "andijon", region: "Andijon", name: "Andijon", lat: 40.7821, lng: 72.3442 },
  { id: "shahrixon", region: "Andijon", name: "Shahrixon", lat: 40.712, lng: 72.057 },
  { id: "asaka", region: "Andijon", name: "Asaka", lat: 40.6415, lng: 72.2386 },
  { id: "paxtaobod", region: "Andijon", name: "Paxtaobod", lat: 40.9294, lng: 72.4969 },
  { id: "xojaobod", region: "Andijon", name: "Xo'jaobod", lat: 40.6689, lng: 72.56 },
  { id: "fargona", region: "Farg'ona", name: "Farg'ona", lat: 40.3864, lng: 71.7864 },
  { id: "qoqon", region: "Farg'ona", name: "Qo'qon", lat: 40.5286, lng: 70.9425 },
  { id: "margilon", region: "Farg'ona", name: "Marg'ilon", lat: 40.4711, lng: 71.7247 },
  { id: "quva", region: "Farg'ona", name: "Quva", lat: 40.5222, lng: 72.0714 },
  { id: "rishton", region: "Farg'ona", name: "Rishton", lat: 40.3567, lng: 71.2847 },
  { id: "namangan", region: "Namangan", name: "Namangan", lat: 40.9983, lng: 71.6726 },
  { id: "toshkent", region: "Toshkent", name: "Toshkent", lat: 41.2995, lng: 69.2401 },
  { id: "yunusobod", region: "Toshkent", name: "Yunusobod", lat: 41.3673, lng: 69.2889 },
  { id: "chilonzor", region: "Toshkent", name: "Chilonzor", lat: 41.2853, lng: 69.2036 },
  { id: "mirzo", region: "Toshkent", name: "Mirzo Ulug'bek", lat: 41.338, lng: 69.3344 },
  { id: "sergeli", region: "Toshkent", name: "Sergeli", lat: 41.223, lng: 69.22 },
  { id: "chirchiq", region: "Toshkent viloyati", name: "Chirchiq", lat: 41.4689, lng: 69.5822 },
  { id: "angren", region: "Toshkent viloyati", name: "Angren", lat: 41.0167, lng: 70.1436 },
  { id: "olmaliq", region: "Toshkent viloyati", name: "Olmaliq", lat: 40.8447, lng: 69.5983 },
  { id: "sirdaryo", region: "Sirdaryo", name: "Sirdaryo", lat: 40.4897, lng: 68.7842 },
  { id: "jizzax", region: "Jizzax", name: "Jizzax", lat: 40.1158, lng: 67.8422 },
  { id: "samarqand", region: "Samarqand", name: "Samarqand", lat: 39.6542, lng: 66.9597 },
  { id: "navoiy", region: "Navoiy", name: "Navoiy", lat: 40.0844, lng: 65.3792 },
  { id: "buxoro", region: "Buxoro", name: "Buxoro", lat: 39.7681, lng: 64.4556 },
  { id: "qarshi", region: "Qashqadaryo", name: "Qarshi", lat: 38.8606, lng: 65.789 },
  { id: "termiz", region: "Surxondaryo", name: "Termiz", lat: 37.2242, lng: 67.2783 },
  { id: "urganch", region: "Xorazm", name: "Urganch", lat: 41.55, lng: 60.6333 },
  { id: "nukus", region: "Qoraqalpog'iston", name: "Nukus", lat: 42.4531, lng: 59.6103 },
];

/** GPS shu masofadan uzoq bo'lsa, yaqin shahar deb yozilmaydi. */
export const AREA_MATCH_KM = 45;

export function placeByName(name: string): Place | undefined {
  const key = name.trim().toLowerCase();
  return PLACES.find((place) => place.name.toLowerCase() === key);
}

export function nearestPlace(point: MapPoint): { place: Place; km: number } {
  let best = PLACES[0];
  let bestKm = kmBetween(point, best);
  for (const place of PLACES) {
    const km = kmBetween(point, place);
    if (km < bestKm) {
      best = place;
      bestKm = km;
    }
  }
  return { place: best, km: bestKm };
}

function foldPlace(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[''`\u02BB\u02BC\u2018\u2019]/g, "");
}

export function placeFromPoint(lat: number | null | undefined, lng: number | null | undefined): Place | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const near = nearestPlace({ lat, lng });
  return near.km <= AREA_MATCH_KM ? near.place : null;
}

export function placeFromText(text: string): Place | null {
  const folded = foldPlace(text);
  if (folded.length < 2) return null;
  const hits = PLACES.filter((place) => folded.includes(foldPlace(place.name)));
  hits.sort((a, b) => b.name.length - a.name.length);
  return hits[0] ?? null;
}

export function listingArea(
  label: string,
  lat?: number | null,
  lng?: number | null,
): { region: string; district: string } {
  const place = placeFromPoint(lat, lng) ?? placeFromText(label);
  if (!place) return { region: "", district: "" };
  return { region: place.region, district: place.name };
}

export function matchesArea(selected: Place | null, region: string, district: string): boolean {
  if (!selected) return false;
  if (district.trim() && foldPlace(district) === foldPlace(selected.name)) return true;
  if (!district.trim() && region.trim() && foldPlace(region) === foldPlace(selected.region)) return true;
  return false;
}

export function placeGroups(): { region: string; places: Place[] }[] {
  const groups: { region: string; places: Place[] }[] = [];
  for (const place of PLACES) {
    const found = groups.find((group) => group.region === place.region);
    if (found) found.places.push(place);
    else groups.push({ region: place.region, places: [place] });
  }
  return groups;
}
