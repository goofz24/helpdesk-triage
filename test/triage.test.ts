import { describe, expect, it } from "vitest";
import { triageTicket } from "../src/triage";
import { fakeClient, goodTriage } from "./helpers";

const ticket = { subject: "VPN won't connect", description: "Working from home and the VPN fails." };

describe("triageTicket", () => {
  it("returns the AI answer plus priority and cost", async () => {
    const captured: { params?: any } = {};
    const r = await triageTicket(ticket, { client: fakeClient({}, captured) });
    expect(r.triage?.category).toBe("network_vpn");
    expect(r.priority).toBe(4);
    expect(r.needsHuman).toBe(false);
    expect(r.costUsd).toBeCloseTo(0.00045, 6);
    expect(captured.params.model).toBe("claude-haiku-5-5");
    expect(captured.params.output_config.format.type).toBe("json_schema");
  });
  it("lets code rules overrule the AI", async () => {
    const text = JSON.stringify({ ...goodTriage, category: "security", needs_technician: false });
    const r = await triageTicket(ticket, { client: fakeClient({ text }) });
    expect(r.needsHuman).toBe(true);
    expect(r.reasons).toContain("policy_security_category");
  });
  it("never sends a pasted password to the AI", async () => {
    const captured: { params?: any } = {};
    const r = await triageTicket(
      { subject: "login", description: "my password is Summer2026! help" },
      { client: fakeClient({}, captured) },
    );
    expect(JSON.stringify(captured.params.messages)).not.toContain("Summer2026!");
    expect(r.redactions).toEqual(["password"]);
    expect(r.needsHuman).toBe(true);
  });
  it.each([
    ["refusal", { stop_reason: "refusal" as const }],
    ["cut off", { stop_reason: "max_tokens" as const }],
    ["not JSON", { text: "Sorry, I can't." }],
    ["wrong shape", { text: JSON.stringify({ ...goodTriage, category: "plumbing" }) }],
    ["network error", { throws: new Error("ECONNRESET") }],
  ])("sends the ticket to a person when the AI step fails (%s)", async (_name, reply) => {
    const r = await triageTicket(ticket, { client: fakeClient(reply) });
    expect(r.triage).toBeNull();
    expect(r.needsHuman).toBe(true);
    expect(r.reasons).toEqual(["ai_failed"]);
    expect(r.error).toBeTruthy();
  });
});
