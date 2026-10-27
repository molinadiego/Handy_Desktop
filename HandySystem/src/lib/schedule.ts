import type { WorkOrder } from "./types";

const TERMINAL = new Set(["completed", "cancelled"]);

export function workspaceDateKey(isoDate: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(isoDate));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function activeScheduledOrders(orders: WorkOrder[]): WorkOrder[] {
  return orders.filter((order) => !TERMINAL.has(order.status) && !!order.scheduled_at && !!order.scheduled_end_at
    && Number.isFinite(Date.parse(order.scheduled_at)) && Number.isFinite(Date.parse(order.scheduled_end_at))
    && Date.parse(order.scheduled_end_at) > Date.parse(order.scheduled_at));
}

export function scheduleConflicts(orders: WorkOrder[]): Set<string> {
  const scheduled = activeScheduledOrders(orders);
  const conflicts = new Set<string>();
  for (let left = 0; left < scheduled.length; left += 1) {
    const a = scheduled[left];
    for (let right = left + 1; right < scheduled.length; right += 1) {
      const b = scheduled[right];
      const sharedEmployees = (a.employee_ids ?? []).some((employeeId) => (b.employee_ids ?? []).includes(employeeId));
      if (sharedEmployees && Date.parse(a.scheduled_at!) < Date.parse(b.scheduled_end_at!)
        && Date.parse(b.scheduled_at!) < Date.parse(a.scheduled_end_at!)) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      }
    }
  }
  return conflicts;
}
