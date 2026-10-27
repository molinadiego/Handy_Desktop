import type { WorkOrder } from "./types";
import { workspaceDateKey } from "./schedule";

export function workOrderReportDate(order: WorkOrder): string {
  if (order.status === "completed") return order.completed_at ?? order.created_at;
  if (order.status === "cancelled") return order.cancelled_at ?? order.created_at;
  if (order.status === "scheduled" || order.status === "in_progress") return order.scheduled_at ?? order.created_at;
  return order.created_at;
}

export function withinWorkspaceDateRange(
  isoDate: string,
  from: string,
  to: string,
  timeZone: string,
): boolean {
  const localDay = workspaceDateKey(isoDate, timeZone);
  return (!from || localDay >= from) && (!to || localDay <= to);
}
