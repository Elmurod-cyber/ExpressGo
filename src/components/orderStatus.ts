import type { OrderStatus } from "../types";
import { t } from "../i18n";

export function statusText(status: OrderStatus): string {
  return t(`status.${status}`);
}

export const statusLabel: Record<OrderStatus, string> = {
  get posted() {
    return t("status.posted");
  },
  get accepted() {
    return t("status.accepted");
  },
  get picked_up() {
    return t("status.picked_up");
  },
  get delivered() {
    return t("status.delivered");
  },
  get cancelled() {
    return t("status.cancelled");
  },
};

export const statusTone: Record<OrderStatus, { wrap: string; text: string }> = {
  posted: { wrap: "bg-brand-soft", text: "text-brand" },
  accepted: { wrap: "bg-amber-50", text: "text-amber-700" },
  picked_up: { wrap: "bg-amber-50", text: "text-amber-700" },
  delivered: { wrap: "bg-emerald-50", text: "text-emerald-700" },
  cancelled: { wrap: "bg-slate-100", text: "text-slate-500" },
};
