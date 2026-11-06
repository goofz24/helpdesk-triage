// Text that people read: the internal work note and the reply to the user.
import { findArticle } from "./kb";
import { PRIORITY_LABELS } from "./priority";
import type { TriageResult } from "./triage";

const REASON_TEXT: Record<string, string> = {
  security_incident: "security incident",
  access_or_permission_change: "access or permission change",
  outage_multiple_users: "several people affected",
  hardware_repair_or_replacement: "hardware repair or replacement",
  identity_verification_needed: "identity must be verified",
  user_upset_or_repeat_contact: "upset or repeat contact",
  unclear_request: "request is unclear",
  not_an_it_issue: "not an IT issue",
  no_matching_kb_article: "no KB article fits",
  technician_work_needed: "technician work needed",
  suspicious_instructions_in_ticket: "ticket tries to give orders to the AI",
  policy_security_category: "rule: security tickets always go to a person",
  policy_access_change: "rule: access changes need an approver",
  policy_high_priority: "rule: priority 1 or 2",
  policy_low_confidence: "rule: AI had low confidence",
  policy_suspicious_instructions: "rule: suspicious instructions in ticket",
  policy_language_not_supported: "rule: reply language not supported (EN/ES only)",
  policy_no_kb_article: "rule: no KB article",
  policy_other_category: "rule: category 'other'",
  policy_secret_in_ticket: "rule: user pasted a password or code (removed); force a reset",
  policy_unsafe_reply: "rule: draft reply failed the safety check",
  ai_failed: "AI step failed; triage by hand",
};

export const reasonText = (r: string) => REASON_TEXT[r] ?? r;

export function workNote(result: TriageResult, approvedBy: string): string {
  const t = result.triage;
  if (!t || result.priority === null) {
    return `[AI triage] Not available (${result.error ?? "unknown error"}). Please triage by hand.`;
  }
  const kb = findArticle(t.kb_article);
  return [
    `[AI triage suggestion, approved by ${approvedBy}]`,
    `Category: ${t.category} | Impact: ${t.impact} | Urgency: ${t.urgency} | Priority: ${PRIORITY_LABELS[result.priority]}`,
    `Language: ${t.language} | Confidence: ${t.confidence}`,
    `KB: ${kb ? `${kb.id} ${kb.title_en}` : "none"}`,
    `Needs technician: ${result.needsHuman ? "YES" : "no"}${result.reasons.length ? ` (${result.reasons.map(reasonText).join("; ")})` : ""}`,
    `Summary: ${t.summary_en}`,
    result.redactions.length ? `Note: secrets removed from the ticket before AI processing: ${result.redactions.join(", ")}.` : "",
    `Model: ${result.model}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// The customer-visible reply: the AI's draft + the real KB steps (pasted by
// code from the approved article, never written by the AI).
export function replyWithKb(result: TriageResult): string {
  const t = result.triage;
  if (!t) return "";
  const kb = findArticle(t.kb_article);
  // Mixed tickets: follow the language the draft reply was written in.
  const spanish = t.language === "es" || (t.language === "mixed" && /\b(hola|gracias|técnico|pasos|abajo)\b/iu.test(t.draft_reply));
  if (!kb) return t.draft_reply;
  const title = spanish ? kb.title_es : kb.title_en;
  const body = spanish ? kb.body_es : kb.body_en;
  return `${t.draft_reply}\n\n${kb.id}: ${title}\n${body}`;
}
