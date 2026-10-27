import { describe, expect, it } from "vitest";
import type { WorkOrder } from "./types";
import { activeScheduledOrders, scheduleConflicts, workspaceDateKey } from "./schedule";

function order(id: string, start: string, end: string, status: WorkOrder["status"] = "scheduled"): WorkOrder {
  return { id, status, scheduled_at: start, scheduled_end_at: end, employee_ids: ["e1"] } as WorkOrder;
}

describe("schedule", () => {
  it("groups UTC instants by workspace local date", () => {
    expect(workspaceDateKey("2026-01-01T02:00:00Z", "America/Los_Angeles")).toBe("2025-12-31");
  });
  it("marks overlapping intervals but not adjacent endpoints", () => {
    expect(scheduleConflicts([
      order("a", "2026-03-01T10:00:00Z", "2026-03-01T11:00:00Z"),
      order("b", "2026-03-01T10:30:00Z", "2026-03-01T10:45:00Z"),
      order("c", "2026-03-01T11:00:00Z", "2026-03-01T12:00:00Z"),
    ])).toEqual(new Set(["a", "b"]));
  });
  it("only warns when overlapping orders share an employee", () => {
    const first = order("first", "2026-03-01T10:00:00Z", "2026-03-01T11:00:00Z");
    const other = { ...order("other", "2026-03-01T10:10:00Z", "2026-03-01T10:40:00Z"), employee_ids: ["e2"] };
    expect(scheduleConflicts([first, other])).toEqual(new Set());
    expect(scheduleConflicts([first, { ...other, employee_ids: ["e1"] }])).toEqual(new Set(["first", "other"]));
  });
  it("excludes terminal and invalid intervals", () => {
    expect(activeScheduledOrders([
      order("done", "2026-03-01T10:00:00Z", "2026-03-01T11:00:00Z", "completed"),
      order("bad", "2026-03-01T11:00:00Z", "2026-03-01T10:00:00Z"),
    ])).toHaveLength(0);
  });
});
