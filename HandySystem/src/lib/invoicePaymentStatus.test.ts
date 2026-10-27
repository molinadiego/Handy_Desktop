import { describe, expect, it } from "vitest";
import { getInvoicePaymentStatus } from "./invoicePaymentStatus";

describe("invoice payment status", () => {
  it("keeps the payment state separate from draft and voided lifecycle states", () => {
    expect(getInvoicePaymentStatus({ status: "draft", paid_minor: 0, balance_minor: 1000 })).toBeNull();
    expect(getInvoicePaymentStatus({ status: "voided", paid_minor: 0, balance_minor: 0 })).toBeNull();
  });

  it("derives unpaid, partial, and paid from applied amounts and remaining balance", () => {
    expect(getInvoicePaymentStatus({ status: "issued", paid_minor: 0, balance_minor: 1000 })).toBe("unpaid");
    expect(getInvoicePaymentStatus({ status: "issued", paid_minor: 400, balance_minor: 600 })).toBe("partial");
    expect(getInvoicePaymentStatus({ status: "issued", paid_minor: 1000, balance_minor: 0 })).toBe("paid");
  });
});
