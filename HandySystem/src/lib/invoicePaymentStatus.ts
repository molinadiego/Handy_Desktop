import type { Invoice } from "./types";

export type InvoicePaymentStatus = "unpaid" | "partial" | "paid";

export function getInvoicePaymentStatus(
  invoice: Pick<Invoice, "status" | "paid_minor" | "balance_minor">,
): InvoicePaymentStatus | null {
  if (invoice.status !== "issued") return null;
  if (invoice.balance_minor <= 0) return "paid";
  return invoice.paid_minor > 0 ? "partial" : "unpaid";
}
