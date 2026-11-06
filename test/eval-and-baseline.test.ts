import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fakeTriage } from "../src/fake-triage";
import { scoreTicket, summarize, type EvalTicket } from "../src/eval-score";
import { TriageSchema } from "../src/schema";
import { replyWithKb, workNote } from "../src/format";

const tickets: EvalTicket[] = JSON.parse(readFileSync("evals/tickets.json", "utf8"));

describe("keyword baseline + scoring", async () => {
  const results = await Promise.all(tickets.map((t) => fakeTriage(t)));
  const scores = tickets.map((t, i) => scoreTicket(t, results[i]));

  it("produces schema-valid answers for every ticket", () => {
    for (const r of results) expect(TriageSchema.safeParse(r.triage).success).toBe(true);
  });
  it("never sends a pasted secret to the AI", () => {
    expect(scores.some((s) => s.secretLeaked)).toBe(false);
  });
  it("computes recall and precision for 'needs a person'", () => {
    const s = summarize(scores, tickets);
    expect(s.tickets).toBe(60);
    expect(s.needsHumanRecall).not.toBeNull();
    expect(s.needsHumanPrecision).not.toBeNull();
    const needed = tickets.filter((t) => t.expected.needs_human).length;
    expect(Math.round(((needed - s.missedHuman.length) / needed) * 1000) / 10).toBe(s.needsHumanRecall);
  });
  it("writes a work note and a Spanish reply with the Spanish KB steps", () => {
    const i = tickets.findIndex((t) => t.id === "T002");
    expect(workNote(results[i], "Mel")).toContain("approved by Mel");
    expect(replyWithKb(results[i])).toContain("Restablecer tu contraseña");
  });
});
