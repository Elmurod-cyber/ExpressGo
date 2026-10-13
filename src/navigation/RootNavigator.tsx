import { AdminHomeScreen } from "../screens/AdminHomeScreen";
import { useSession } from "../context/Session";
import { CityShell } from "./CityShell";

export function RootNavigator() {
  const { account, dock } = useSession();
  if (account && dock === "admin") return <AdminHomeScreen />;
  return <CityShell />;
}
