import { describe, expect, it } from "vitest";
import { priorityFor } from "../src/priority";

describe("priority matrix (ServiceNow default)", () => {
  it("maps impact x urgency to 1-5", () => {
    expect(priorityFor("whole_org", "high")).toBe(1);
    expect(priorityFor("multiple_users", "high")).toBe(2);
    expect(priorityFor("whole_org", "medium")).toBe(2);
    expect(priorityFor("single_user", "high")).toBe(3);
    expect(priorityFor("single_user", "medium")).toBe(4);
    expect(priorityFor("single_user", "low")).toBe(5);
  });
});
