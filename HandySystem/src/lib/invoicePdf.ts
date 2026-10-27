import { jsPDF } from "jspdf";
import type { Invoice } from "./types";
import type { Locale } from "../i18n";
import { formatWorkspaceDateTime } from "./time";
import { formatMinorUnits } from "./money";

export function createInvoicePdfBase64(
  invoice: Invoice,
  workspaceName: string,
  locale: Locale,
  timeZone: string,
  t: (key: Parameters<typeof import("../i18n").translate>[1]) => string,
): string {
  const language = locale === "es" ? "es" : "en";
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const left = 18;
  const right = 192;
  const width = right - left;
  let y = 20;

  const addLine = (text: string, fontSize = 10, bold = false, gap = 6) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(fontSize);
    const lines = pdf.splitTextToSize(text, width) as string[];
    if (y + lines.length * gap > 275) {
      pdf.addPage();
      y = 20;
    }
    pdf.text(lines, left, y);
    y += lines.length * gap;
  };

  addLine(workspaceName, 18, true, 8);
  addLine(`${t("invoices")} · ${invoice.reference_code}`, 12, true, 7);
  addLine(`${t("invoiceStatus_issued")} · ${formatWorkspaceDateTime(invoice.issued_at ?? invoice.created_at, language, timeZone)}`, 9, false, 6);
  y += 5;
  addLine(t("billTo"), 9, true, 6);
  addLine(invoice.recipient_name, 11, true, 6);
  if (invoice.contact_name) addLine(invoice.contact_name, 9, false, 5);
  if (invoice.recipient_email) addLine(invoice.recipient_email, 9, false, 5);
  addLine(invoice.address_line1, 9, false, 5);
  addLine([invoice.address_line2, invoice.city].filter(Boolean).join(", "), 9, false, 6);
  y += 5;
  addLine(t("description"), 9, true, 6);
  addLine(invoice.description, 10, false, 6);
  y += 7;

  const taxLabel = invoice.tax_rate_basis_points === null
    ? t("invoiceTax")
    : `${t("invoiceTax")} (${new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 2 }).format(invoice.tax_rate_basis_points / 10_000)})`;
  const rows = [
    [t("invoiceSubtotal"), formatMinorUnits(invoice.subtotal_minor, invoice.currency_code, language)],
    [taxLabel, formatMinorUnits(invoice.tax_minor, invoice.currency_code, language)],
    [t("total"), formatMinorUnits(invoice.total_minor, invoice.currency_code, language)],
  ];
  for (const [label, value] of rows) {
    pdf.setFont("helvetica", label === t("total") ? "bold" : "normal");
    pdf.setFontSize(label === t("total") ? 12 : 10);
    pdf.text(label, left, y);
    pdf.text(value, right, y, { align: "right" });
    y += label === t("total") ? 9 : 7;
  }

  const dataUrl = pdf.output("datauristring");
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
