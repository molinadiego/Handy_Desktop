import { describe, expect, it } from "vitest";
import { missingQuickRequestFields } from "./validation";
import type { RequestInput } from "./types";

const baseRequest: RequestInput = {
  clientType: "direct",
  contactName: "Ava Smith",
  contactPhone: "+1 555 0100",
  tenantName: "",
  tenantPhone: "",
  addressLine1: "42 Oak Street",
  addressLine2: "",
  city: "",
  subdivision: "",
  postalCode: "",
  description: "Repair a leaking faucet",
  preferredAt: "",
};

describe("quick request validation", () => {
  it("accepts the required contact, address, and description without optional fields", () => {
    expect(missingQuickRequestFields(baseRequest)).toEqual([]);
  });

  it("requires contact name, phone, street address, and work description", () => {
    expect(missingQuickRequestFields({
      ...baseRequest,
      contactName: "  ",
      contactPhone: "",
      addressLine1: "",
      description: " ",
    })).toEqual(["contactName", "contactPhone", "addressLine1", "description"]);
  });

  it("does not require a tenant for a property-manager request", () => {
    expect(missingQuickRequestFields({ ...baseRequest, clientType: "property_manager" })).toEqual([]);
  });
});
