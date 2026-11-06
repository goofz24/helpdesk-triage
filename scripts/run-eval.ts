// Accuracy test: triage every ticket in evals/tickets.json and score it.
//
//   npm run eval:fake                     free keyword baseline, no API key
//   npm run estimate                      show the expected cost, spend nothing
//   npm run eval -- --yes                 real run on Claude Haiku 5.5 (a few cents)
//   npm run eval -- --yes --model claude-sonnet-5-5 --split test --limit 10
//
// Safety: a real run needs --yes, and it stops before going over --max-spend
// (default $0.50). Results go to evals/results/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { argValue, hasArg, loadEnv } from "../src/env";
import { fakeTriage } from "../src/fake-triage";
import { DEFAULT_MODEL, makeClaudeTriager, type TriageResult, type Triager } from "../src/triage";
import { SYSTEM_PROMPT, buildUserMessage } from "../src/prompt";
import { PRICES_PER_MILLION, WORST_CASE_PRICE, worstCaseCostUsd } from "../src/cost";
import { scoreTicket, summarize, type EvalTicket, type TicketScore } from "../src/eval-score";
import { renderReport } from "../src/report";

loadEnv();
const fake = hasArg("--fake");
const model = fake ? "keyword-rules" : (argValue("--model") ?? DEFAULT_MODEL);
const split = argValue("--split") ?? "all";
const limit = Number(argValue("--limit") ?? Infinity);
const maxSpend = Number(argValue("--max-spend") ?? 0.5);

const all: EvalTicket[] = JSON.parse(readFileSync("evals/tickets.json", "utf8"));
const tickets = all.filter((t) => split === "all" || t.split === split).slice(0, limit);

// Rough estimate: ~3.5 characters per token; ~700 output tokens per ticket
// (a little thinking + the JSON answer).
function estimate(): number {
  const price = PRICES_PER_MILLION[model] ?? WORST_CASE_PRICE;
  const input = tickets.reduce((sum, t) => sum + (SYSTEM_PROMPT.length + buildUserMessage(t).length) / 3.5, 0);
  const output = tickets.length * 700;
  return (input * price.input + output * price.output) / 1_000_000;
}

if (!fake) {
  const est = estimate();
  console.log(`${tickets.length} tickets on ${model}: estimated cost about $${est.toFixed(3)} (spend stop at $${maxSpend.toFixed(2)}).`);
  if (hasArg("--estimate-only")) process.exit(0);
  if (!hasArg("--yes")) {
    console.log("Nothing was sent. Add --yes to run it for real.");
    process.exit(0);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Put it in .env (see .env.example).");
    process.exit(1);
  }
}

const triage: Triager = fake ? fakeTriage : makeClaudeTriager(new Anthropic(), model);
const rows: { ticket: EvalTicket; result: TriageResult; score: TicketScore }[] = [];
let spent = 0;
for (const ticket of tickets) {
  if (spent >= maxSpend) {
    console.log(`Spend stop reached ($${spent.toFixed(3)}). Stopping early.`);
    break;
  }
  const result = await triage(ticket);
  spent += result.costUsd ?? (result.usage ? worstCaseCostUsd(result.usage) : 0);
  const score = scoreTicket(ticket, result);
  rows.push({ ticket, result, score });
  const flags = [score.ok.category ? "" : "category-miss", score.missedHuman ? "MISSED-PERSON" : "", result.triage ? "" : "AI-FAILED"]
    .filter(Boolean)
    .join(" ");
  console.log(`${ticket.id} ${result.triage?.category ?? "-"} P${result.priority ?? "-"} ${result.needsHuman ? "person" : "self-help"} ${flags}`);
}

const scores = rows.map((r) => r.score);
const summaries = [
  { label: "Test split (headline)", summary: summarize(scores.filter((s) => s.split === "test"), all) },
  { label: "Dev split", summary: summarize(scores.filter((s) => s.split === "dev"), all) },
  { label: "All", summary: summarize(scores, all) },
].filter((x) => x.summary.tickets > 0);

const when = new Date().toISOString();
const stamp = when.replace(/[:.]/g, "-").slice(0, 19);
mkdirSync("evals/results", { recursive: true });
const base = `evals/results/${stamp}-${model}`;
writeFileSync(
  `${base}.json`,
  JSON.stringify({ model, when, costUsd: spent, summaries, rows: rows.map((r) => ({ id: r.ticket.id, result: r.result, score: r.score })) }, null, 1),
);
const html = renderReport({ title: "Help desk triage: accuracy report", model, when, costUsd: spent, summaries, rows });
writeFileSync(`${base}.html`, html);
writeFileSync(`evals/results/latest-${fake ? "fake" : "real"}.html`, html);

console.log("\nResults");
for (const { label, summary: s } of summaries) {
  console.log(
    `${label}: ${s.tickets} tickets | needs-a-person recall ${s.needsHumanRecall}% precision ${s.needsHumanPrecision}% | category ${s.categoryAccuracy}% | priority exact ${s.priorityExact}% (within one ${s.priorityWithinOne}%) | KB ${s.kbAccuracy}% | language ${s.languageAccuracy}%`,
  );
  if (s.missedHuman.length) console.log(`  missed a needed person: ${s.missedHuman.join(", ")}`);
  if (s.secretsLeaked.length) console.log(`  SECRETS SENT TO AI: ${s.secretsLeaked.join(", ")}`);
}
console.log(`Cost: $${spent.toFixed(4)}. Report: ${base}.html`);
