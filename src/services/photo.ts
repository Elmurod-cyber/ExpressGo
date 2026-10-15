import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

export async function takeProofPhoto(): Promise<string | null> {
  if (Platform.OS !== "web") {
    const camera = await ImagePicker.requestCameraPermissionsAsync();
    if (camera.granted) {
      const shot = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.55,
        allowsEditing: false,
      });
      if (shot.canceled) return null;
      return shot.assets[0]?.uri ?? null;
    }
  }

  const library = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!library.granted) {
    throw new Error("Kamera yoki galereyaga ruxsat berilmadi.");
  }
  const pick = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.55,
  });
  if (pick.canceled) return null;
  return pick.assets[0]?.uri ?? null;
}

export async function pickAvatarPhoto(): Promise<string | null> {
  if (Platform.OS !== "web") {
    const library = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!library.granted) throw new Error("Galereyaga ruxsat berilmadi.");
  }
  const pick = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.35,
    base64: true,
  });
  if (pick.canceled) return null;
  const raw = pick.assets[0]?.base64 ?? "";
  if (!raw) throw new Error("Rasm o'qilmadi. Boshqasini tanlang.");
  const data = `data:image/jpeg;base64,${raw}`;
  if (data.length > 480_000) throw new Error("Rasm juda katta. Yaqinroq rasm tanlang.");
  return data;
}
