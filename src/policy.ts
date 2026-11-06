// Guardrails written in plain code, so they hold even when the AI is wrong.
//
// The AI suggests; these rules decide. Any one of them sends the ticket to a
// technician, whatever the AI said. They can only ADD reasons, never remove
// the AI's own reasons, so the system is at least as careful as the AI.
import type { Triage } from "./schema";
import type { RedactionKind } from "./redact";

export const POLICY_REASONS = [
  "policy_security_category", // phishing, lost device, malware: always a human
  "policy_access_change", // permissions need an approver
  "policy_high_priority", // priority 1 or 2
  "policy_low_confidence",
  "policy_suspicious_instructions",
  "policy_language_not_supported", // only English and Spanish replies are approved
  "policy_no_kb_article",
  "policy_other_category",
  "policy_secret_in_ticket", // user pasted a password or code: force a reset
  "policy_unsafe_reply", // the draft asks for a secret or claims work was done
  "ai_failed", // API error, refusal, cut-off or invalid answer
] as const;
export type PolicyReason = (typeof POLICY_REASONS)[number];

// Phrases a draft reply must never contain.
const ASKS_FOR_SECRET =
  /\b(send|share|tell|give|provide|reply with|confirm)\b[^.?!\n]{0,40}\b(password|passcode|verification code|mfa code|one-time code)\b|\b(env[ií]a(?:nos|me)?|comparte|dinos|dime|danos|proporciona|confirma)\b[^.?!\n]{0,40}\b(contraseña|contrasena|clave|c[oó]digo)\b/iu;
const CLAIMS_DONE =
  /\b(i|we)(?:'ve| have)\s+(reset|unlocked|granted|given you|added you|installed|wiped|disabled|changed)\b|\b(ya\s+)?(te\s+|le\s+)?(hemos|he)\s+(restablecido|desbloqueado|dado|otorgado|instalado|borrado|cambiado|agregado)\b/iu;
const LOOKS_LIKE_PASSWORD = /\b(?=\S*\d)(?=\S*[A-Za-z])\S*[!@#$%^&*]\S*\b/u;

export function unsafeReplyProblems(reply: string): string[] {
  const problems: string[] = [];
  if (ASKS_FOR_SECRET.test(reply)) problems.push("asks the user for a password or code");
  if (CLAIMS_DONE.test(reply)) problems.push("says an action was already done");
  if (LOOKS_LIKE_PASSWORD.test(reply)) problems.push("contains something that looks like a password");
  return problems;
}

export function policyReasons(triage: Triage, priority: number, redactions: RedactionKind[]): PolicyReason[] {
  const reasons: PolicyReason[] = [];
  if (triage.category === "security") reasons.push("policy_security_category");
  if (triage.category === "access_request") reasons.push("policy_access_change");
  if (priority <= 2) reasons.push("policy_high_priority");
  if (triage.confidence === "low") reasons.push("policy_low_confidence");
  if (triage.suspicious_instructions) reasons.push("policy_suspicious_instructions");
  if (triage.language === "other") reasons.push("policy_language_not_supported");
  if (triage.kb_article === "none") reasons.push("policy_no_kb_article");
  if (triage.category === "other") reasons.push("policy_other_category");
  if (redactions.includes("password") || redactions.includes("verification_code")) reasons.push("policy_secret_in_ticket");
  if (unsafeReplyProblems(triage.draft_reply).length > 0) reasons.push("policy_unsafe_reply");
  return reasons;
}
