import type { RequestInput } from "./types";

export type RequiredRequestField = "contactName" | "contactPhone" | "addressLine1" | "description";

export function missingQuickRequestFields(input: RequestInput): RequiredRequestField[] {
  const required: RequiredRequestField[] = ["contactName", "contactPhone", "addressLine1", "description"];
  return required.filter((field) => !input[field].trim());
}
