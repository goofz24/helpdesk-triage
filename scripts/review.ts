// The technician's review screen (in the terminal).
//
// For each new ticket: the AI suggests, a person decides. Nothing is written
// to ServiceNow until the technician presses a key, and the reply to the user
// is only sent on the separate "send" choice.
//
//   npm run review -- --source file --fake       free demo: sample tickets, keyword rules, no writes
//   npm run review -- --source file              sample tickets through Claude (costs about $0.0005 each)
//   npm run review                               new incidents from your ServiceNow instance
//   npm run review -- --dry-run                  same, but never writes to ServiceNow
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import Anthropic from "@anthropic-ai/sdk";
import { argValue, hasArg, loadEnv } from "../src/env";
import { fakeTriage } from "../src/fake-triage";
import { DEFAULT_MODEL, makeClaudeTriager, type TriageResult, type Triager } from "../src/triage";
import { ServiceNowClient, configFromEnv, type Incident } from "../src/servicenow";
import { IMPACT_TO_SN, PRIORITY_LABELS, URGENCY_TO_SN } from "../src/priority";
import { findArticle } from "../src/kb";
import { reasonText, replyWithKb, workNote } from "../src/format";
import type { EvalTicket } from "../src/eval-score";

loadEnv();
const source = argValue("--source") ?? "servicenow";
const fake = hasArg("--fake");
const dryRun = hasArg("--dry-run") || source === "file";
const limit = Number(argValue("--limit") ?? 5);
const model = argValue("--model") ?? DEFAULT_MODEL;
const STATE_FILE = ".triage-state.json";

if (!fake && !process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Add it to .env, or use --fake for the free keyword mode.");
  process.exit(1);
}
const triage: Triager = fake ? fakeTriage : makeClaudeTriager(new Anthropic(), model);

let sn: ServiceNowClient | null = null;
let incidents: Incident[];
if (source === "file") {
  const tickets: EvalTicket[] = JSON.parse(readFileSync("evals/tickets.json", "utf8"));
  incidents = tickets.slice(0, limit).map((t) => ({
    sys_id: t.id,
    number: t.id,
    short_description: t.subject,
    description: t.description,
    caller: t.caller,
    opened_at: "",
  }));
} else {
  const config = configFromEnv();
  if (!config) {
    console.error("ServiceNow isn't set up: add SN_INSTANCE, SN_USER and SN_PASSWORD to .env (see docs/SERVICENOW-SETUP.md).");
    process.exit(1);
  }
  sn = new ServiceNowClient(config);
  const seen: string[] = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : [];
  incidents = (await sn.listNewIncidents(limit * 3)).filter((i) => !seen.includes(i.sys_id)).slice(0, limit);
}

function remember(sysId: string) {
  if (source === "file") return;
  const seen: string[] = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : [];
  writeFileSync(STATE_FILE, JSON.stringify([...new Set([...seen, sysId])], null, 1));
}

function card(inc: Incident, r: TriageResult): string {
  const t = r.triage;
  const lines = [
    "",
    "=".repeat(72),
    `${inc.number}  ${inc.short_description}`,
    `From: ${inc.caller || "(unknown)"}`,
    `${inc.description}`,
    "-".repeat(72),
  ];
  if (!t || r.priority === null) {
    lines.push(`AI triage failed: ${r.error}. Triage this one by hand.`);
    return lines.join("\n");
  }
  const kb = findArticle(t.kb_article);
  lines.push(
    `Category: ${t.category}   Priority: ${PRIORITY_LABELS[r.priority]} (impact ${t.impact}, urgency ${t.urgency})`,
    `Language: ${t.language}   Confidence: ${t.confidence}   KB: ${kb ? `${kb.id} ${kb.title_en}` : "none"}`,
    `Needs a technician: ${r.needsHuman ? "YES" : "no"}`,
    ...r.reasons.map((x) => `  - ${reasonText(x)}`),
    r.redactions.length ? `!! Secrets were removed before the AI saw this ticket: ${r.redactions.join(", ")}` : "",
    `Summary: ${t.summary_en}`,
    "",
    "Draft reply to the user (not sent yet):",
    replyWithKb(r)
      .split("\n")
      .map((l) => `  | ${l}`)
      .join("\n"),
  );
  return lines.filter((l) => l !== "").join("\n");
}

// Read answers line by line (works when typing and when input is piped in a test).
const rl = createInterface({ input: stdin, terminal: false });
const lines = rl[Symbol.asyncIterator]();
async function ask(question: string): Promise<string> {
  stdout.write(question);
  const next = await lines.next();
  if (next.done) {
    console.log("\n(no more input)");
    process.exit(0);
  }
  return next.value;
}
const tech = process.env.TECH_NAME ?? process.env.SN_USER ?? "technician";
console.log(
  `${incidents.length} ticket(s) to review. Mode: ${fake ? "keyword rules (free)" : model}${dryRun ? ", dry run (nothing is written)" : ""}.`,
);

for (const inc of incidents) {
  const result = await triage({ subject: inc.short_description, description: inc.description });
  console.log(card(inc, result));
  const t = result.triage;
  if (!t || result.priority === null) {
    await ask("Press Enter for the next ticket.");
    continue;
  }
  let reply = replyWithKb(result);
  for (;;) {
    const choice = (
      await ask("\n[a] approve triage  [r] approve + send reply  [e] edit reply  [s] skip  [q] quit > ")
    )
      .trim()
      .toLowerCase();
    if (choice === "q") {
      rl.close();
      process.exit(0);
    }
    if (choice === "s") break;
    if (choice === "e") {
      const edited = await ask("New reply text (one line; the KB steps are added again below it):\n> ");
      const kb = findArticle(t.kb_article);
      reply = kb ? `${edited}\n\n${replyWithKb({ ...result, triage: { ...t, draft_reply: "" } }).trim()}` : edited;
      console.log(`Reply updated:\n${reply}`);
      continue;
    }
    if (choice === "a" || choice === "r") {
      const note = workNote(result, tech);
      if (dryRun || !sn) {
        console.log(`(dry run) Would set impact ${IMPACT_TO_SN[t.impact]}, urgency ${URGENCY_TO_SN[t.urgency]}, category ${t.category} and add this work note:\n${note}`);
        if (choice === "r") console.log(`(dry run) Would send this reply to the user:\n${reply}`);
      } else {
        await sn.applyTriage(inc.sys_id, { impact: IMPACT_TO_SN[t.impact], urgency: URGENCY_TO_SN[t.urgency], category: t.category, workNote: note });
        console.log(`Saved to ${inc.number}.`);
        if (choice === "r") {
          await sn.sendReply(inc.sys_id, reply);
          console.log("Reply sent to the user.");
        }
        remember(inc.sys_id);
      }
      break;
    }
  }
}
rl.close();
console.log("\nDone.");
