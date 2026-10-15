import type { ReactNode } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { statusLabel } from "../components/orderStatus";
import { useT } from "../context/Session";
import { formatMoney } from "../services/money";
import { VEHICLE_LABEL } from "../server/rules";
import type { LiveJob } from "../types";

export function DeliveryEntry({
  onBack,
  onOrder,
  onCourier,
  jobs,
  onOpenJob,
  children,
}: {
  onBack: () => void;
  onOrder: () => void;
  onCourier: () => void;
  jobs: LiveJob[];
  onOpenJob: (id: string) => void;
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <Screen compact>
      <View className="px-4 pb-6 pt-2">
        <Pressable onPress={onBack} accessibilityRole="button" className="mb-3 flex-row items-center self-start">
          <Ionicons name="chevron-back" size={20} color="#C2410C" />
          <Text className="ml-1 text-sm font-semibold text-[#C2410C]">{t("build.back")}</Text>
        </Pressable>
        <View className="overflow-hidden rounded-[28px] bg-[#121212]">
          <Image
            source={require("../../assets/delivery/delivery-courier.jpg")}
            style={{ width: "100%", height: 280 }}
            resizeMode="cover"
            accessibilityLabel={t("city.tile_delivery")}
          />
          <View className="absolute inset-x-0 bottom-0 bg-black/55 px-5 pb-5 pt-10">
            <Text className="text-3xl font-bold text-white">{t("city.tile_delivery")}</Text>
            <Text className="mt-2 text-base leading-6 text-white">{t("deliver.entry_body")}</Text>
          </View>
        </View>
        <Pressable
          onPress={onOrder}
          accessibilityRole="button"
          className="mt-5 flex-row items-center justify-center rounded-full bg-[#C2410C] py-4 active:opacity-90"
        >
          <Ionicons name="cube-outline" size={20} color="#FFFFFF" />
          <Text className="ml-2 text-base font-bold text-white">{t("sender.new_btn")}</Text>
        </Pressable>
        <Pressable
          onPress={onCourier}
          accessibilityRole="button"
          className="mt-3 flex-row items-center justify-center rounded-full bg-[#121212] py-4 active:opacity-90"
        >
          <Ionicons name="bicycle" size={20} color="#FFFFFF" />
          <Text className="ml-2 text-base font-bold text-white">{t("city.courier")}</Text>
        </Pressable>
        {jobs.length === 0 ? (
          <View className="mt-5 rounded-3xl bg-white px-5 py-6">
            <Text className="text-base font-semibold text-ink">{t("city.live_empty")}</Text>
            <Text className="mt-2 text-sm text-muted">{t("city.live_hint")}</Text>
          </View>
        ) : (
          jobs.map((job) => (
            <Pressable
              key={job.id}
              onPress={() => onOpenJob(job.id)}
              accessibilityRole="button"
              className="mt-3 rounded-3xl bg-[#E7EEF6] px-4 py-2.5 active:opacity-90"
            >
              <Text className="text-xs font-semibold text-brand">{statusLabel[job.status]}</Text>
              <Text className="mt-2 text-base font-semibold text-ink">
                {job.pickup} → {job.dropoff}
              </Text>
              <Text className="mt-1 text-sm text-muted">
                {job.item} · {VEHICLE_LABEL[job.vehicle]}
              </Text>
              <Text className="mt-2 self-end text-[21px] font-extrabold text-[#C2410C]">{formatMoney(job.deliveryFee)}</Text>
            </Pressable>
          ))
        )}
        {children}
      </View>
    </Screen>
  );
}
