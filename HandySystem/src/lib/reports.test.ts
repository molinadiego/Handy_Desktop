import { describe, expect, it } from "vitest";
import type { WorkOrder } from "./types";
import { withinWorkspaceDateRange, workOrderReportDate } from "./reports";

describe("report date selection", () => {
  const base = { created_at: "2026-04-01T12:00:00Z", scheduled_at: "2026-04-05T14:00:00Z", completed_at: "2026-04-08T15:00:00Z", cancelled_at: "2026-04-07T16:00:00Z" };
  it("uses the lifecycle date appropriate to each order status", () => {
    expect(workOrderReportDate({ ...base, status: "scheduled" } as WorkOrder)).toBe(base.scheduled_at);
    expect(workOrderReportDate({ ...base, status: "completed" } as WorkOrder)).toBe(base.completed_at);
    expect(workOrderReportDate({ ...base, status: "cancelled" } as WorkOrder)).toBe(base.cancelled_at);
    expect(workOrderReportDate({ ...base, status: "pending" } as WorkOrder)).toBe(base.created_at);
  });
  it("uses inclusive local dates in the workspace timezone", () => {
    expect(withinWorkspaceDateRange("2026-04-02T01:00:00Z", "2026-04-01", "2026-04-01", "America/Los_Angeles")).toBe(true);
    expect(withinWorkspaceDateRange("2026-04-02T01:00:00Z", "2026-04-02", "2026-04-02", "America/Los_Angeles")).toBe(false);
  });
});
