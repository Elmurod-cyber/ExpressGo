import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { placeGroups, PLACES, placeFromPoint, type Place } from "../server/places";
import { useT } from "./Session";

const AREA_KEY = "expressgo.v1.area";

type AreaValue = {
  place: Place | null;
  source: "gps" | "manual" | null;
  ready: boolean;
  denied: boolean;
  openPicker: () => void;
  useGps: () => Promise<void>;
};

const AreaContext = createContext<AreaValue | null>(null);

export function AreaProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [place, setPlace] = useState<Place | null>(null);
  const [source, setSource] = useState<"gps" | "manual" | null>(null);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [far, setFar] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [region, setRegion] = useState("");
  const placeRef = useRef<Place | null>(null);
  const groups = placeGroups();
  const districts = groups.find((group) => group.region === region)?.places ?? [];

  const save = useCallback(async (next: Place, from: "gps" | "manual") => {
    placeRef.current = next;
    setPlace(next);
    setSource(from);
    setFar(false);
    setPickerOpen(false);
    setRegion("");
    await AsyncStorage.setItem(AREA_KEY, next.id);
  }, []);

  const locate = useCallback(
    async (autoOpen: boolean) => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          setDenied(true);
          if (autoOpen && !placeRef.current) setPickerOpen(true);
          return;
        }
        setDenied(false);
        const position = await Location.getCurrentPositionAsync({});
        const found = placeFromPoint(position.coords.latitude, position.coords.longitude);
        if (found) {
          await save(found, "gps");
          return;
        }
        setFar(true);
        if (autoOpen && !placeRef.current) setPickerOpen(true);
      } catch {
        setDenied(true);
        if (autoOpen && !placeRef.current) setPickerOpen(true);
      }
    },
    [save],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await AsyncStorage.getItem(AREA_KEY);
        const stored = saved ? PLACES.find((item) => item.id === saved) ?? null : null;
        if (cancelled) return;
        if (stored) {
          placeRef.current = stored;
          setPlace(stored);
          setSource("manual");
          setReady(true);
          return;
        }
        await locate(true);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locate]);

  const value = useMemo<AreaValue>(
    () => ({
      place,
      source,
      ready,
      denied,
      openPicker: () => setPickerOpen(true),
      useGps: () => locate(false),
    }),
    [place, source, ready, denied, locate],
  );

  return (
    <AreaContext.Provider value={value}>
      {children}
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[80%] rounded-t-3xl bg-white px-4 pb-8 pt-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-ink">{t("area.pick")}</Text>
              <Pressable onPress={() => setPickerOpen(false)} accessibilityRole="button" className="p-1">
                <Ionicons name="close" size={22} color="#44403C" />
              </Pressable>
            </View>
            <Text className="mb-3 text-sm leading-5 text-muted">{denied ? t("area.denied") : far ? t("area.far") : t("area.need")}</Text>
            <Pressable onPress={() => void locate(false)} accessibilityRole="button" className="mb-3 flex-row items-center justify-center rounded-full bg-[#121212] py-3">
              <Ionicons name="locate" size={18} color="#FFFFFF" />
              <Text className="ml-2 text-sm font-bold text-white">{t("area.gps")}</Text>
            </Pressable>
            <ScrollView>
              {region ? (
                <>
                  <Pressable onPress={() => setRegion("")} accessibilityRole="button" className="mb-2 flex-row items-center">
                    <Ionicons name="chevron-back" size={18} color="#C2410C" />
                    <Text className="ml-1 text-sm font-semibold text-[#C2410C]">{region}</Text>
                  </Pressable>
                  {districts.map((item) => (
                    <Pressable key={item.id} onPress={() => void save(item, "manual")} accessibilityRole="button" className="border-b border-line py-3">
                      <Text className="text-base text-ink">{item.name}</Text>
                    </Pressable>
                  ))}
                </>
              ) : (
                groups.map((group) => (
                  <Pressable key={group.region} onPress={() => setRegion(group.region)} accessibilityRole="button" className="border-b border-line py-3">
                    <Text className="text-base font-semibold text-ink">{group.region}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </AreaContext.Provider>
  );
}

export function useArea(): AreaValue {
  const value = useContext(AreaContext);
  if (!value) throw new Error("Hudud topilmadi.");
  return value;
}
