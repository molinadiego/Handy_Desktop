export function currencyFractionDigits(currencyCode: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function decimalToMinorUnits(value: string, currencyCode: string): number | null {
  return decimalToScaledInteger(value, currencyFractionDigits(currencyCode));
}

export function percentToBasisPoints(value: string): number | null {
  return decimalToScaledInteger(value, 2);
}

function decimalToScaledInteger(value: string, fractionDigits: number): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d*)?$/.test(trimmed)) return null;
  const [wholeText, fractionText = ""] = trimmed.split(".");
  if (fractionText.length > fractionDigits) return null;
  const scale = 10n ** BigInt(fractionDigits);
  const whole = BigInt(wholeText);
  const fraction = BigInt(fractionText.padEnd(fractionDigits, "0") || "0");
  const scaled = whole * scale + fraction;
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(scaled);
}

export function formatMinorUnits(amountMinor: number, currencyCode: string, locale: string): string {
  const scale = 10 ** currencyFractionDigits(currencyCode);
  return new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode }).format(amountMinor / scale);
}

export function minorUnitsToDecimal(amountMinor: number, currencyCode: string): string {
  const fractionDigits = currencyFractionDigits(currencyCode);
  return (amountMinor / 10 ** fractionDigits).toFixed(fractionDigits);
}

export function supportedCurrencyCodes(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "currency") => string[] };
  return intl.supportedValuesOf?.("currency") ?? ["USD", "CAD", "MXN", "EUR", "GBP", "AUD", "NZD", "JPY"];
}
