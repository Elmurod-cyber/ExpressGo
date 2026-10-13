import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "expressgo.v1.build-profile";

export type BuildWho = "master" | "employer";

export type BuildProfile = {
  name: string;
  phone: string;
  token?: string;
};

type Saved = Partial<Record<BuildWho, BuildProfile>>;

export async function readBuildProfiles(): Promise<Saved> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Saved;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveBuildProfile(who: BuildWho, profile: BuildProfile): Promise<void> {
  const saved = await readBuildProfiles();
  saved[who] = profile;
  await AsyncStorage.setItem(KEY, JSON.stringify(saved));
}
