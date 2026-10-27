import { describe, expect, it } from "vitest";
import { createInvoicePdfBase64 } from "./invoicePdf";
import type { Invoice } from "./types";
import { translate, type Locale } from "../i18n";

const invoice = {
  id: "invoice-1",
  work_order_id: "order-1",
  reference_code: "INV-TEST-01",
  status: "issued",
  recipient_name: "Morgan Client",
  contact_name: "Morgan",
  contact_phone: "555-0100",
  recipient_email: "morgan@example.com",
  address_line1: "1 Main Street",
  address_line2: null,
  city: "Testville",
  description: "Repair a faucet",
  subtotal_minor: 10_000,
  tax_minor: 866,
  tax_rate_basis_points: 866,
  total_minor: 10_866,
  currency_code: "USD",
  client_type: "direct",
  created_at: "2026-10-24T12:00:00Z",
  issued_at: "2026-10-24T12:00:00Z",
  sent_at: null,
  voided_at: null,
  void_reason: null,
  paid_minor: 0,
  reversed_payment_minor: 0,
  balance_minor: 10_866,
} as Invoice;

describe("invoice PDF attachment", () => {
  it("creates a base64 encoded PDF for the invoice", () => {
    const t = (key: Parameters<typeof translate>[1]) => translate("en" as Locale, key);
    const base64 = createInvoicePdfBase64(invoice, "Handy Business", "en", "UTC", t);
    const header = atob(base64.slice(0, 12));
    expect(header.startsWith("%PDF-")).toBe(true);
    expect(base64.length).toBeGreaterThan(1000);
  });
});
