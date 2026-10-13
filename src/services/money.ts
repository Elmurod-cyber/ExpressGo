import { t } from "../i18n";

export function formatMoney(amount: number): string {
  const formatted = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${formatted} ${t("money.som")}`;
}
