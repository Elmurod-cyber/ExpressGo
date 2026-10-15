import "./global.css";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "./src/context/Session";
import { AreaProvider } from "./src/context/Area";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { downloadUpdateInBackground } from "./src/services/appUpdates";
import { registerForPushNotificationsAsync } from "./src/services/push";

export default function App() {
  useEffect(() => {
    void downloadUpdateInBackground();
    void registerForPushNotificationsAsync();
  }, []);

  return (
    <SafeAreaProvider style={{ flex: 1, width: "100%" }}>
      <StatusBar style="dark" />
      <SessionProvider>
        <AreaProvider>
          <View
            className={Platform.OS === "web" ? "flex-1 items-center bg-[#D5DBE6]" : "w-full flex-1"}
            style={Platform.OS === "web" ? undefined : { flex: 1, width: "100%", backgroundColor: "#171717" }}
          >
            <View
              className={Platform.OS === "web" ? "h-full w-full max-w-md flex-1 bg-canvas" : "h-full w-full flex-1"}
              style={Platform.OS === "web" ? undefined : { flex: 1, width: "100%" }}
            >
              <RootNavigator />
            </View>
          </View>
        </AreaProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
