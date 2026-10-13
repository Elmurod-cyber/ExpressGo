import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

type PingPlayer = {
  seekTo: (seconds: number) => Promise<unknown> | unknown;
  play: () => void;
};

export async function alertPing(player?: PingPlayer | null) {
  try {
    if (Platform.OS === "android") {
      await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm);
      setTimeout(() => {
        void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press);
      }, 160);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTimeout(() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 160);
    }
  } catch {
    // Tebranish yo'q qurilmada ovoz baribir chalinadi.
  }

  try {
    if (!player) return;
    await player.seekTo(0);
    player.play();
  } catch {
    // Ovoz chalolmadi — karta baribir ochiladi.
  }
}
