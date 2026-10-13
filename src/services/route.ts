import type { VehicleKind } from "../types";
import { asVehicle, etaMinutes } from "../server/rules";
import { kmBetween, type MapPoint } from "./distance";

export type RoadRoute = {
  km: number;
  minutes: number;
  road: boolean;
  line: MapPoint[];
};

export function routeTargetKey(point: MapPoint): string {
  return `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
}

function profileOf(vehicle: VehicleKind): "driving" | "walking" {
  return vehicle === "walk" ? "walking" : "driving";
}

function straight(from: MapPoint, to: MapPoint): RoadRoute {
  const km = kmBetween(from, to);
  return { km, minutes: etaMinutes(km) ?? 1, road: false, line: [from, to] };
}

function thinLine(line: MapPoint[], max = 180): MapPoint[] {
  if (line.length <= max) return line;
  const step = (line.length - 1) / (max - 1);
  const out: MapPoint[] = [];
  for (let index = 0; index < max; index += 1) out.push(line[Math.round(index * step)]);
  return out;
}

function lineOf(geometry: { coordinates?: [number, number][] } | undefined, fallback: MapPoint[]): MapPoint[] {
  const coords = geometry?.coordinates;
  if (!coords || coords.length < 2) return fallback;
  const line = coords
    .map(([lng, lat]) => ({ lat, lng }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  return thinLine(line.length >= 2 ? line : fallback);
}

export async function roadTrip(points: MapPoint[], vehicle?: VehicleKind | null): Promise<RoadRoute> {
  if (points.length < 2) return { km: 0, minutes: 1, road: false, line: points.slice() };
  if (points.length === 2) return roadRoute(points[0], points[1], vehicle);
  const kind = asVehicle(vehicle);
  const fallback: RoadRoute = points.slice(1).reduce(
    (acc, to, index) => {
      const leg = straight(points[index], to);
      return { km: acc.km + leg.km, minutes: acc.minutes + leg.minutes, road: false, line: points.slice() };
    },
    { km: 0, minutes: 0, road: false, line: points.slice() },
  );
  fallback.km = Math.round(fallback.km * 10) / 10;
  fallback.minutes = Math.max(1, Math.round(fallback.minutes));
  fallback.line = points.slice();
  const coords = points.map((point) => `${point.lng},${point.lat}`).join(";");
  const url =
    `https://router.project-osrm.org/route/v1/${profileOf(kind)}/` +
    `${coords}?overview=full&geometries=geojson&alternatives=false`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const response = await fetch(url, { signal: ctrl.signal });
    if (!response.ok) return fallback;
    const data = (await response.json()) as {
      code?: string;
      routes?: { distance: number; duration: number; geometry?: { coordinates?: [number, number][] } }[];
    };
    const route = data.code === "Ok" ? data.routes?.[0] : null;
    if (!route || !Number.isFinite(route.distance) || route.distance <= 0) return fallback;
    return {
      km: Math.round((route.distance / 1000) * 10) / 10,
      minutes: Math.max(1, Math.round(route.duration / 60)),
      road: true,
      line: lineOf(route.geometry, points),
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

export async function roadRoute(
  from: MapPoint,
  to: MapPoint,
  vehicle?: VehicleKind | null,
): Promise<RoadRoute> {
  const kind = asVehicle(vehicle);
  const fallback = straight(from, to);
  const url =
    `https://router.project-osrm.org/route/v1/${profileOf(kind)}/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=false`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const response = await fetch(url, { signal: ctrl.signal });
    if (!response.ok) return fallback;
    const data = (await response.json()) as {
      code?: string;
      routes?: { distance: number; duration: number; geometry?: { coordinates?: [number, number][] } }[];
    };
    const route = data.code === "Ok" ? data.routes?.[0] : null;
    if (!route || !Number.isFinite(route.distance) || route.distance <= 0) return fallback;
    const km = Math.round((route.distance / 1000) * 10) / 10;
    const minutes = Math.max(1, Math.round(route.duration / 60));
    return { km, minutes, road: true, line: lineOf(route.geometry, [from, to]) };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
