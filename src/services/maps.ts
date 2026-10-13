import { Linking } from "react-native";
import type { MapPoint } from "./distance";

export async function openRoute(point: MapPoint): Promise<void> {
  const lat = point.lat.toFixed(6);
  const lng = point.lng.toFixed(6);
  const yandex = `https://yandex.ru/maps/?rtext=~${lat},${lng}&rtt=auto`;
  const google = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  try {
    await Linking.openURL(yandex);
  } catch {
    await Linking.openURL(google);
  }
}

export async function openRouteLine(from: MapPoint, to: MapPoint): Promise<void> {
  const start = `${from.lat.toFixed(6)},${from.lng.toFixed(6)}`;
  const end = `${to.lat.toFixed(6)},${to.lng.toFixed(6)}`;
  const yandex = `https://yandex.ru/maps/?rtext=${start}~${end}&rtt=auto`;
  const google = `https://www.google.com/maps/dir/?api=1&origin=${start}&destination=${end}&travelmode=driving`;
  try {
    await Linking.openURL(yandex);
  } catch {
    await Linking.openURL(google);
  }
}
