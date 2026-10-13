import * as Updates from "expo-updates";

/** Release build ochilganda yangilanishni fonda tekshiradi va yuklab oladi. */
export async function downloadUpdateInBackground(): Promise<void> {
  if (__DEV__) return;
  try {
    if (!Updates.isEnabled) return;
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    await Updates.fetchUpdateAsync();
  } catch {
    // Expo Go, tarmoq yoki server javob bermasa joriy nusxa ochiq qoladi.
  }
}
