// Triage one ticket: redact secrets, ask Claude, then apply our own rules.
//
// Order of checks after Claude answers:
//   1. Did Claude refuse?          -> technician (ai_failed)
//   2. Was the answer cut off?     -> technician (ai_failed)
//   3. Valid JSON that fits the schema? If not -> technician (ai_failed)
//   4. Code rules from policy.ts add more reasons (security, access, P1/P2 ...).
// Any API error (bad key, rate limit, outage) -> technician (ai_failed).
// On failure there is NO guessed category: a person triages it by hand.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { TriageSchema, type Triage } from "./schema";
import { SYSTEM_PROMPT, buildUserMessage, type TicketInput } from "./prompt";
import { redact, type RedactionKind } from "./redact";
import { policyReasons, type PolicyReason } from "./policy";
import { priorityFor } from "./priority";
import { costUsd, type TokenUsage } from "./cost";

// Haiku is the cheapest current model and fits a short classification task.
// Mel's budget rule: cheap model by default; try others with --model.
export const DEFAULT_MODEL = "claude-haiku-5-5";

export type TriageResult = {
  triage: Triage | null; // null when the AI step failed
  priority: number | null; // 1 (critical) to 5 (planning), from impact x urgency
  needsHuman: boolean;
  reasons: string[]; // AI reasons + code policy reasons, no duplicates
  redactions: RedactionKind[];
  sentText: string; // exactly what was sent to the AI (after redaction)
  model: string | null;
  usage: TokenUsage | null;
  costUsd: number | null;
  error?: string; // short technical note for logs
};

// Only the part of the SDK we use, so tests can pass in a fake.
export type ClaudeClient = { messages: { create: Anthropic["messages"]["create"] } };
export type Triager = (ticket: TicketInput) => Promise<TriageResult>;

function prepare(ticket: TicketInput) {
  const subject = redact(ticket.subject);
  const description = redact(ticket.description);
  const redactions = [...new Set([...subject.found, ...description.found])];
  const safe: TicketInput = { subject: subject.text, description: description.text };
  return { safe, redactions, sentText: buildUserMessage(safe) };
}

function failed(error: string, base: Pick<TriageResult, "redactions" | "sentText">, extra: Partial<TriageResult> = {}): TriageResult {
  return {
    triage: null,
    priority: null,
    needsHuman: true,
    reasons: ["ai_failed"],
    model: null,
    usage: null,
    costUsd: null,
    error,
    ...base,
    ...extra,
  };
}

// Combine the AI's answer with the code rules. Used by the real and the fake triager.
export function finalize(
  triage: Triage,
  base: Pick<TriageResult, "redactions" | "sentText">,
  meta: Pick<TriageResult, "model" | "usage" | "costUsd">,
): TriageResult {
  const priority = priorityFor(triage.impact, triage.urgency);
  const policy: PolicyReason[] = policyReasons(triage, priority, base.redactions);
  const reasons = [...new Set<string>([...triage.technician_reasons, ...policy])];
  const needsHuman = triage.needs_technician || policy.length > 0;
  return { triage, priority, needsHuman, reasons, ...base, ...meta };
}

export async function triageTicket(
  ticket: TicketInput,
  opts: { client: ClaudeClient; model?: string },
): Promise<TriageResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const { safe, redactions, sentText } = prepare(ticket);
  const base = { redactions, sentText };

  let response: Anthropic.Message;
  try {
    response = await opts.client.messages.create({
      model,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(safe) }],
      // Structured outputs: the answer is constrained to TriageSchema.
      // Low effort: this is a short classification task.
      output_config: { effort: "low", format: zodOutputFormat(TriageSchema) },
    });
  } catch (err) {
    // The SDK already retried twice on rate limits, timeouts and 5xx errors.
    if (err instanceof Anthropic.AuthenticationError) return failed("Claude API key is missing or wrong", base);
    if (err instanceof Anthropic.RateLimitError) return failed("Claude API rate limit, try again later", base);
    if (err instanceof Anthropic.APIError) return failed(`Claude API error ${err.status ?? "(no status)"}: ${err.message}`, base);
    return failed(`Could not reach Claude: ${(err as Error).message}`, base);
  }

  const usage: TokenUsage = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
  const meta = { model: response.model, usage, costUsd: costUsd(response.model, usage) };

  if (response.stop_reason === "refusal") {
    return failed(`Claude declined (${response.stop_details?.category ?? "no category"})`, base, meta);
  }
  if (response.stop_reason === "max_tokens") return failed("Answer was cut off at max_tokens", base, meta);

  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return failed("Answer was not valid JSON", base, meta);
  }
  const checked = TriageSchema.safeParse(json);
  if (!checked.success) {
    return failed(`Answer didn't match the schema: ${checked.error.issues[0]?.message}`, base, meta);
  }
  return finalize(checked.data, base, meta);
}

export function makeClaudeTriager(client: ClaudeClient, model?: string): Triager {
  return (ticket) => triageTicket(ticket, { client, model });
}

export { prepare as prepareTicket };
