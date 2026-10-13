import { useEffect, useState } from "react";
import { Alert, Image, Linking, Pressable, Text, View } from "react-native";
import { api } from "../services/api";
import { formatMoney } from "../services/money";
import { AD_PLAN_SOM, AD_SLOT_LABEL } from "../server/rules";
import type { AdCard, AdSlot } from "../types";
import { useT } from "../context/Session";

const banners = {
  kitchen: require("../../assets/ads/kitchen.jpg"),
  street: require("../../assets/ads/street.jpg"),
  market: require("../../assets/ads/market.jpg"),
} as const;

/** Fonsiz matn har qanday rasm ustida o'qilishi uchun. */
const legible = {
  textShadowColor: "rgba(0, 0, 0, 0.75)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
};

type AdBannerProps = {
  id: AdSlot;
};

export function AdBanner({ id }: AdBannerProps) {
  const t = useT();
  const [ad, setAd] = useState<AdCard | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      void api.getAd(id).then((next) => {
        if (!cancelled) setAd(next);
      });
    }
    load();
    const timer = setInterval(load, 12_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  async function open() {
    if (!ad?.live) {
      Alert.alert(
        t("ad.slot_title"),
        t("ad.banner_body", {
          slot: AD_SLOT_LABEL[id],
          day: formatMoney(AD_PLAN_SOM.day),
          week: formatMoney(AD_PLAN_SOM.week),
          month: formatMoney(AD_PLAN_SOM.month),
        }),
      );
      return;
    }
    try {
      setAd(await api.clickAd(ad.id));
    } catch {
      // Bosish hisobi ixtiyoriy.
    }
    const digits = ad.phone.replace(/\D/g, "");
    const number = digits.length <= 9 ? `998${digits}` : digits;
    Alert.alert(ad.title, `${ad.place}\n+${number}`, [
      { text: t("close"), style: "cancel" },
      {
        text: t("ad.call"),
        onPress: () => void Linking.openURL(`tel:+${number}`),
      },
    ]);
  }

  return (
    <Pressable
      onPress={() => void open()}
      accessibilityRole="button"
      accessibilityLabel={ad?.live ? `${ad.title} ${t("ad.badge")}` : t("ad.slot_title")}
      className="h-[132px] overflow-hidden rounded-3xl active:opacity-90"
    >
      <Image
        source={banners[id]}
        resizeMode="cover"
        style={{ width: "100%", height: 220, marginTop: -44 }}
      />
      <View className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1">
        <Text className="text-xs font-semibold text-white">{t("ad.badge")}</Text>
      </View>
      {ad?.live ? (
        <View className="absolute bottom-3 left-4 right-4">
          <Text numberOfLines={1} className="text-base font-bold text-white" style={legible}>
            {ad.title}
          </Text>
          <Text numberOfLines={1} className="mt-0.5 text-xs font-medium text-white" style={legible}>
            {ad.place} · {t("ad.call_hint")}
          </Text>
        </View>
      ) : (
        <View className="absolute bottom-3 left-4 right-4">
          <Text className="text-base font-bold text-white" style={legible}>
            {t("ad.empty")}
          </Text>
          <Text className="mt-0.5 text-xs font-medium text-white" style={legible}>
            {t("ad.empty_hint", { price: formatMoney(AD_PLAN_SOM.day) })}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
