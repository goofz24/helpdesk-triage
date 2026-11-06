// A one-page HTML report of an eval run (easy to screenshot for the README).
import type { EvalTicket, Summary, TicketScore } from "./eval-score";
import type { TriageResult } from "./triage";
import { PRIORITY_LABELS } from "./priority";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ESCAPES[c] ?? c);
const fmt = (v: number | null) => (v === null ? "n/a" : `${v}%`);

export function renderReport(opts: {
  title: string;
  model: string;
  when: string;
  costUsd: number;
  summaries: { label: string; summary: Summary }[];
  rows: { ticket: EvalTicket; result: TriageResult; score: TicketScore }[];
}): string {
  const metricRows: [string, (s: Summary) => string][] = [
    ["Tickets", (s) => String(s.tickets)],
    ["Needs-a-person recall (most important)", (s) => fmt(s.needsHumanRecall)],
    ["Needs-a-person precision", (s) => fmt(s.needsHumanPrecision)],
    ["Category accuracy", (s) => fmt(s.categoryAccuracy)],
    ["Priority exact", (s) => fmt(s.priorityExact)],
    ["Priority within one level", (s) => fmt(s.priorityWithinOne)],
    ["KB article accuracy", (s) => fmt(s.kbAccuracy)],
    ["Language accuracy", (s) => fmt(s.languageAccuracy)],
    ["Missed a needed person", (s) => s.missedHuman.join(", ") || "none"],
    ["Secrets sent to the AI", (s) => s.secretsLeaked.join(", ") || "none"],
    ["Suspicious tickets missed", (s) => s.suspiciousMissed.join(", ") || "none"],
    ["Unsafe draft replies caught", (s) => s.unsafeReplies.join(", ") || "none"],
    ["AI failures", (s) => s.aiFailures.join(", ") || "none"],
  ];
  const head = `<tr><th>Metric</th>${opts.summaries.map((x) => `<th>${esc(x.label)}</th>`).join("")}</tr>`;
  const body = metricRows
    .map(([name, f]) => `<tr><td>${esc(name)}</td>${opts.summaries.map((x) => `<td>${esc(f(x.summary))}</td>`).join("")}</tr>`)
    .join("");
  const mark = (ok: boolean) => (ok ? "" : ' class="miss"');
  const ticketRows = opts.rows
    .map(({ ticket: t, result: r, score: s }) => {
      const tr = r.triage;
      return `<tr>
<td>${esc(t.id)}<br><small>${esc(t.split)}</small></td>
<td><b>${esc(t.subject)}</b><br><small>${esc(t.why)}</small></td>
<td${mark(s.ok.category)}>${esc(tr?.category ?? "-")}<br><small>exp. ${esc(t.expected.category)}</small></td>
<td${mark(s.ok.priorityExact)}>${esc(r.priority ? PRIORITY_LABELS[r.priority] : "-")}<br><small>exp. ${esc(PRIORITY_LABELS[s.expectedPriority])}</small></td>
<td${mark(s.ok.kb)}>${esc(tr?.kb_article ?? "-")}<br><small>exp. ${esc(t.expected.kb_article ?? "none")}</small></td>
<td${mark(s.ok.needsHuman)}>${r.needsHuman ? "yes" : "no"}<br><small>exp. ${t.expected.needs_human ? "yes" : "no"}</small></td>
<td><small>${esc(tr?.draft_reply ?? r.error ?? "")}</small></td>
</tr>`;
    })
    .join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
body{font-family:system-ui,Segoe UI,sans-serif;margin:2rem;color:#1d2433;max-width:1200px}
h1{font-size:1.5rem;margin-bottom:.2rem}p.meta{color:#5b6475;margin-top:0}
table{border-collapse:collapse;width:100%;margin:1rem 0 2rem}th,td{border:1px solid #d7dbe3;padding:.45rem .6rem;text-align:left;vertical-align:top;font-size:.9rem}
th{background:#f1f3f7}td.miss{background:#fde8e8}small{color:#5b6475}
</style></head><body>
<h1>${esc(opts.title)}</h1>
<p class="meta">Model: ${esc(opts.model)} · Run: ${esc(opts.when)} · Cost: $${opts.costUsd.toFixed(4)} · Headline numbers are the <b>test</b> split (tickets never used to tune the prompt).</p>
<table>${head}${body}</table>
<h2>Every ticket</h2><p class="meta">Red cells don't match the expected answer.</p>
<table><tr><th>ID</th><th>Ticket</th><th>Category</th><th>Priority</th><th>KB</th><th>Needs a person</th><th>Draft reply</th></tr>${ticketRows}</table>
</body></html>`;
}
