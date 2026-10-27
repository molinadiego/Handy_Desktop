import { describe, expect, it } from "vitest";
import { dateTimeLocalToUtc, formatWorkspaceDateTime, utcToDateTimeLocal } from "./time";

describe("workspace timezone helpers", () => {
  it("formats UTC instants in the configured timezone", () => {
    expect(utcToDateTimeLocal("2026-03-15T16:30:00.000Z", "America/Los_Angeles")).toBe("2026-03-15T09:30");
  });

  it("converts a local visit time back to UTC", () => {
    expect(dateTimeLocalToUtc("2026-03-15T09:30", "America/Los_Angeles")).toBe("2026-03-15T16:30:00.000Z");
  });

  it("round-trips UTC and formats the display timezone", () => {
    const instant = dateTimeLocalToUtc("2026-11-02T14:00", "UTC");
    expect(instant).toBe("2026-11-02T14:00:00.000Z");
    expect(formatWorkspaceDateTime(instant, "en-US", "UTC")).toContain("2:00 PM");
  });

  it("rejects local times skipped by daylight-saving changes", () => {
    expect(() => dateTimeLocalToUtc("2026-03-08T02:30", "America/Los_Angeles")).toThrow(/no existe/);
  });
});
