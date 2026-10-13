import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "expressgo.v1.trip-profile";

export type TripSide = "rider" | "driver";

export type TripProfile = {
  id: string;
  name: string;
  phone: string;
  token?: string;
};

type Saved = Partial<Record<TripSide, TripProfile>>;

export async function readTripProfiles(): Promise<Saved> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Saved;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveTripProfile(side: TripSide, profile: TripProfile): Promise<void> {
  const saved = await readTripProfiles();
  saved[side] = profile;
  await AsyncStorage.setItem(KEY, JSON.stringify(saved));
}
