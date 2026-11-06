import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KB_ARTICLES, KB_IDS } from "../src/kb";
import { CATEGORIES } from "../src/schema";
import type { EvalTicket } from "../src/eval-score";

const tickets: EvalTicket[] = JSON.parse(readFileSync("evals/tickets.json", "utf8"));

describe("knowledge base", () => {
  it("has 15 articles with unique ids, each in English and Spanish", () => {
    expect(KB_ARTICLES).toHaveLength(15);
    expect(new Set(KB_IDS).size).toBe(15);
    for (const a of KB_ARTICLES) {
      expect(a.title_en && a.title_es && a.body_en && a.body_es).toBeTruthy();
      expect(CATEGORIES).toContain(a.category);
    }
  });
});

describe("test tickets", () => {
  it("has 60 tickets: 20 dev, 40 test, unique ids", () => {
    expect(tickets).toHaveLength(60);
    expect(new Set(tickets.map((t) => t.id)).size).toBe(60);
    expect(tickets.filter((t) => t.split === "dev")).toHaveLength(20);
  });
  it("only uses valid labels", () => {
    for (const t of tickets) {
      expect(CATEGORIES).toContain(t.expected.category);
      if (t.expected.kb_article) expect(KB_IDS).toContain(t.expected.kb_article);
      if (t.expected.secret) expect(t.description).toContain(t.expected.secret);
    }
  });
  it("covers both languages and both outcomes", () => {
    expect(tickets.filter((t) => t.expected.language === "es").length).toBeGreaterThanOrEqual(20);
    expect(tickets.filter((t) => t.expected.needs_human).length).toBeGreaterThan(25);
    expect(tickets.filter((t) => !t.expected.needs_human).length).toBeGreaterThan(20);
  });
});
