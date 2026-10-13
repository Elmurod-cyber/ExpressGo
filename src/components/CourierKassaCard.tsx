import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../services/api";
import { formatMoney } from "../services/money";
import { TOPUP_PAY, formatReadyAt } from "../server/rules";
import type { CourierKassa, LedgerEntry } from "../types";
import { useT } from "../context/Session";

export function CourierKassaCard({ userId }: { userId: string; onChanged: () => Promise<void> }) {
  const t = useT();
  const [kassa, setKassa] = useState<CourierKassa | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setKassa(await api.getKassa(userId));
  }, [userId]);

  useEffect(() => {
    void load().catch(() => {
      setError("Kassa ochilmadi.");
    });
  }, [load]);

  const balance = kassa?.balance ?? 0;
  const moves = (kassa?.entries ?? []).filter((entry) => entry.kind !== "deposit");

  return (
    <View className="mt-3 rounded-3xl bg-white px-4 py-3">
      <Text className="text-xs text-muted">{t("auth.deposit")}</Text>
      <Text className="text-lg font-bold text-ink">{formatMoney(balance)}</Text>

      {kassa ? (
        <View className="mt-3 flex-row">
          <KassaStat label={t("kassa.topped")} value={formatMoney(kassa.topupTotal)} />
          <KassaStat label={t("kassa.fee")} value={formatMoney(kassa.commissionTotal)} />
          <KassaStat label={t("kassa.out")} value={formatMoney(kassa.cashedTotal)} />
        </View>
      ) : null}

      <Text className="mt-3 text-xs text-muted">{t("kassa.topup")}</Text>
      <View className="mt-2 rounded-xl bg-canvas px-3 py-2">
        <PayLine label={t("kassa.card")} value={TOPUP_PAY.card} />
        <PayLine label={t("kassa.phone")} value={TOPUP_PAY.phone} />
        <PayLine label={t("kassa.telegram")} value={TOPUP_PAY.telegram} />
      </View>

      {error ? <Text className="mt-2 text-sm text-red-600">{error}</Text> : null}

      {moves.length > 0 ? (
        <View className="mt-3 border-t border-slate-100 pt-3">
          <Text className="text-xs text-muted">{t("kassa.moves")}</Text>
          {moves.slice(0, 8).map((entry) => (
            <LedgerRow key={entry.id} entry={entry} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PayLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center py-1">
      <Text className="w-20 text-xs text-muted">{label}</Text>
      <Text className="flex-1 text-sm font-semibold text-ink">{value}</Text>
    </View>
  );
}

function KassaStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="mr-3 flex-1">
      <Text className="text-[11px] text-muted">{label}</Text>
      <Text className="mt-0.5 text-xs font-semibold text-ink">{value}</Text>
    </View>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const t = useT();
  const plus = entry.amount > 0;
  const when = formatReadyAt(entry.at);
  const shown = when === t("ready.now") ? `${when}:` : when;
  return (
    <View className="mt-2">
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 pr-3 text-sm font-medium text-ink">{entry.label}</Text>
        <Text className={`text-sm font-semibold ${plus ? "text-[#12B76A]" : "text-[#B42318]"}`}>
          {plus ? "+" : ""}
          {formatMoney(entry.amount)}
        </Text>
      </View>
      <View className="mt-0.5 flex-row items-center justify-between">
        <Text className="text-sm font-medium text-ink">{shown}</Text>
        <Text className="text-sm font-semibold text-[#12B76A]">{formatMoney(entry.balance)}</Text>
      </View>
    </View>
  );
}
