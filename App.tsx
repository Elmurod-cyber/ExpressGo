import "./global.css";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "./src/context/Session";
import { AreaProvider } from "./src/context/Area";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { downloadUpdateInBackground } from "./src/services/appUpdates";

export default function App() {
  useEffect(() => {
    void downloadUpdateInBackground();
  }, []);

  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <SessionProvider>
        <AreaProvider>
          <View className="flex-1 items-center bg-[#D5DBE6]">
            <View className="h-full w-full max-w-md flex-1 bg-canvas">
              <RootNavigator />
            </View>
          </View>
        </AreaProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
