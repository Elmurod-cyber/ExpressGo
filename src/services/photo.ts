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
