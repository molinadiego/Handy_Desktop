import { describe, expect, it } from "vitest";
import type { Estimate, FollowUpTaskOverride, Invoice, WorkOrder } from "./types";
import { buildFollowUpSuggestions } from "./followups";

const estimate = { id: "quote-1", status: "sent", sent_at: "2026-10-20T12:00:00Z", recipient_name: "Morgan", address_line1: "1 Main", work_order_id: null } as Estimate;
const order = { id: "order-1", status: "scheduled", scheduled_at: "2026-10-30T12:00:00Z", recipient_name: "Riley", address_line1: "2 Oak" } as WorkOrder;
const invoice = { id: "invoice-1", work_order_id: "order-1", status: "issued", issued_at: "2026-10-20T12:00:00Z", sent_at: "2026-10-20T12:00:00Z", reference_code: "INV-001", recipient_name: "Morgan", address_line1: "1 Main", balance_minor: 8500, currency_code: "USD" } as Invoice;

describe("follow-up suggestions", () => {
  it("uses configured days and flags overdue suggestions", () => {
    const result = buildFollowUpSuggestions([estimate], [order], { estimate_followup_days: 2, appointment_confirmation_days: 1, payment_followup_days: 15 }, [], "2026-10-23T00:00:00Z");
    expect(result.map((task) => task.due_at)).toEqual(["2026-10-22T12:00:00.000Z", "2026-10-29T12:00:00.000Z"]);
    expect(result[0].overdue).toBe(true);
    expect(result[1].overdue).toBe(false);
  });
  it("uses 15 calendar days when unset and excludes completed or dismissed tasks", () => {
    const defaults = buildFollowUpSuggestions([estimate], [order], { estimate_followup_days: null, appointment_confirmation_days: null, payment_followup_days: null }, [], "2026-10-23T00:00:00Z");
    expect(defaults.map((task) => task.due_at)).toEqual(["2026-10-15T12:00:00.000Z", "2026-11-04T12:00:00.000Z"]);
    const overrides: FollowUpTaskOverride[] = [
      { task_type: "estimate_follow_up", entity_id: estimate.id, due_at: "2026-10-22T12:00:00Z", status: "completed" },
      { task_type: "appointment_confirmation", entity_id: order.id, due_at: "2026-10-29T12:00:00Z", status: "dismissed" },
    ];
    expect(buildFollowUpSuggestions([estimate], [order], { estimate_followup_days: 2, appointment_confirmation_days: 1, payment_followup_days: 15 }, overrides, "2026-10-23T00:00:00Z")).toEqual([]);
  });
  it("uses per-task due date overrides", () => {
    const result = buildFollowUpSuggestions([estimate], [], { estimate_followup_days: 2, appointment_confirmation_days: null, payment_followup_days: 15 }, [
      { task_type: "estimate_follow_up", entity_id: estimate.id, due_at: "2026-10-24T09:00:00Z", status: "open" },
    ], "2026-10-23T00:00:00Z");
    expect(result[0].due_at).toBe("2026-10-24T09:00:00Z");
    expect(result[0].overdue).toBe(false);
  });

  it("suggests collection only for issued invoices with an open balance", () => {
    const invoices = [
      invoice,
      { ...invoice, id: "paid", balance_minor: 0 },
      { ...invoice, id: "draft", status: "draft" },
      { ...invoice, id: "voided", status: "voided" },
      { ...invoice, id: "unsent", sent_at: null },
    ] as Invoice[];
    const result = buildFollowUpSuggestions(
      [],
      [],
      { estimate_followup_days: null, appointment_confirmation_days: null, payment_followup_days: 3 },
      [],
      "2026-10-23T00:00:00Z",
      invoices,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      task_type: "invoice_payment_follow_up",
      entity_id: invoice.id,
      reference_code: "INV-001",
      balance_minor: 8500,
      currency_code: "USD",
      due_at: "2026-10-23T12:00:00.000Z",
      overdue: false,
    });
  });

  it("honors payment follow-up overrides and disappears when the balance is cleared", () => {
    const override: FollowUpTaskOverride = {
      task_type: "invoice_payment_follow_up",
      entity_id: invoice.id,
      due_at: "2026-10-24T09:00:00Z",
      status: "open",
    };
    const settings = { estimate_followup_days: null, appointment_confirmation_days: null, payment_followup_days: 15 };
    const changedDue = buildFollowUpSuggestions([], [], settings, [override], "2026-10-23T00:00:00Z", [invoice]);
    expect(changedDue[0].due_at).toBe(override.due_at);
    expect(buildFollowUpSuggestions([], [], settings, [], "2026-10-23T00:00:00Z", [{ ...invoice, balance_minor: 0 }])).toEqual([]);
    expect(buildFollowUpSuggestions([], [], settings, [{ ...override, status: "dismissed" }], "2026-10-23T00:00:00Z", [invoice])).toEqual([]);
  });
});
