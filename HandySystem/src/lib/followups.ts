import type { Estimate, FollowUpSettings, FollowUpSuggestion, FollowUpTaskOverride, Invoice, WorkOrder } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildFollowUpSuggestions(
  estimates: Estimate[],
  orders: WorkOrder[],
  settings: FollowUpSettings,
  overrides: FollowUpTaskOverride[],
  now: string,
  invoices: Invoice[] = [],
): FollowUpSuggestion[] {
  const overrideMap = new Map(overrides.map((override) => [`${override.task_type}:${override.entity_id}`, override]));
  const suggestions: FollowUpSuggestion[] = [];
  const estimateFollowUpDays = settings.estimate_followup_days ?? 15;
  if (estimateFollowUpDays) {
    for (const estimate of estimates) {
      if (estimate.status !== "sent" || !estimate.sent_at) continue;
      const override = overrideMap.get(`estimate_follow_up:${estimate.id}`);
      if (override?.status === "completed" || override?.status === "dismissed") continue;
      const defaultDue = Date.parse(estimate.sent_at) + estimateFollowUpDays * DAY_MS;
      const dueAt = override?.due_at ?? new Date(defaultDue).toISOString();
      suggestions.push({
        id: `estimate_follow_up:${estimate.id}`,
        task_type: "estimate_follow_up",
        entity_id: estimate.id,
        title: "estimateFollowUp",
        recipient_name: estimate.recipient_name,
        address_line1: estimate.address_line1,
        source_at: estimate.sent_at,
        due_at: dueAt,
        overdue: Date.parse(dueAt) < Date.parse(now),
        related_order_id: estimate.work_order_id,
      });
    }
  }
  const appointmentConfirmationDays = settings.appointment_confirmation_days ?? 15;
  if (appointmentConfirmationDays) {
    for (const order of orders) {
      if (order.status !== "scheduled" || !order.scheduled_at) continue;
      const override = overrideMap.get(`appointment_confirmation:${order.id}`);
      if (override?.status === "completed" || override?.status === "dismissed") continue;
      const defaultDue = Date.parse(order.scheduled_at) - appointmentConfirmationDays * DAY_MS;
      const dueAt = override?.due_at ?? new Date(defaultDue).toISOString();
      suggestions.push({
        id: `appointment_confirmation:${order.id}`,
        task_type: "appointment_confirmation",
        entity_id: order.id,
        title: "appointmentConfirmation",
        recipient_name: order.recipient_name,
        address_line1: order.address_line1,
        source_at: order.scheduled_at,
        due_at: dueAt,
        overdue: Date.parse(dueAt) < Date.parse(now),
        related_order_id: order.id,
      });
    }
  }
  const paymentFollowUpDays = settings.payment_followup_days ?? 15;
  if (paymentFollowUpDays) {
    for (const invoice of invoices) {
      if (invoice.status !== "issued" || invoice.balance_minor <= 0 || !invoice.sent_at) continue;
      const override = overrideMap.get(`invoice_payment_follow_up:${invoice.id}`);
      if (override?.status === "completed" || override?.status === "dismissed") continue;
      const defaultDue = Date.parse(invoice.sent_at) + paymentFollowUpDays * DAY_MS;
      const dueAt = override?.due_at ?? new Date(defaultDue).toISOString();
      suggestions.push({
        id: `invoice_payment_follow_up:${invoice.id}`,
        task_type: "invoice_payment_follow_up",
        entity_id: invoice.id,
        title: "invoicePaymentFollowUp",
        recipient_name: invoice.recipient_name,
        address_line1: invoice.address_line1,
        source_at: invoice.sent_at,
        due_at: dueAt,
        overdue: Date.parse(dueAt) < Date.parse(now),
        related_order_id: invoice.work_order_id,
        reference_code: invoice.reference_code,
        balance_minor: invoice.balance_minor,
        currency_code: invoice.currency_code,
      });
    }
  }
  return suggestions.sort((left, right) => Date.parse(left.due_at) - Date.parse(right.due_at));
}
