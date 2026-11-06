// A free, offline "keyword rules" triager. Two jobs:
//   1. Lets the app, the review screen and the tests run with no API key and no cost.
//   2. Acts as a BASELINE: the eval compares Claude against plain keyword rules,
//      which is the honest way to show what the AI actually adds.
import type { TicketInput } from "./prompt";
import type { Category, Impact, Triage, Urgency } from "./schema";
import { finalize, prepareTicket, type TriageResult } from "./triage";

const CATEGORY_KEYWORDS: [Category, RegExp][] = [
  ["security", /phish|suspicious|sospechos|virus|malware|infect|pop-?ups?|stolen|robaron|robo|lost my|perd[ií]|enlace raro|gift card/iu],
  ["access_request", /access to|acceso a|admin rights|administrador|license|licencia|shared mailbox|buz[oó]n compartido|permission|permiso|acrobat pro/iu],
  ["password_mfa", /password|contraseña|contrasena|mfa|authenticator|autenticador|expired|expir/iu],
  ["account_access", /locked|bloquead|can'?t log ?in|no puedo entrar|sign in|iniciar sesi[oó]n|senha/iu],
  ["network_vpn", /vpn|wi-?fi|internet|network|red |conexi[oó]n|router/iu],
  ["email_outlook", /outlook|email|e-mail|correo|mailbox|webmail/iu],
  ["printer", /print|impres|imprim|toner|t[oó]ner/iu],
  ["hardware", /laptop|computadora|monitor|screen|pantalla|battery|bater[ií]a|keyboard|teclado|slow|lent[oa]|disk|disco|new hire|empleado nuevo|empleada nueva/iu],
  ["software", /teams|onedrive|zoom|install|instalar|software|programa|app|portal|sistema/iu],
];

const SPANISH_WORDS = /\b(el|la|los|las|que|de|mi|no|para|con|una|por|es|está|tengo|puedo|ya|se|me)\b/giu;
const ENGLISH_WORDS = /\b(the|my|is|it|to|and|can|i|for|on|with|this|not|have|of)\b/giu;

const KB_FOR: Partial<Record<Category, string>> = {
  password_mfa: "KB-001",
  account_access: "KB-003",
  access_request: "KB-007",
  network_vpn: "KB-004",
  email_outlook: "KB-006",
  printer: "KB-008",
  hardware: "KB-012",
  software: "KB-011",
  security: "KB-009",
};

function detectLanguage(text: string): Triage["language"] {
  const es = text.match(SPANISH_WORDS)?.length ?? 0;
  const en = text.match(ENGLISH_WORDS)?.length ?? 0;
  if (es === 0 && en === 0) return "other";
  if (es > 0 && en > 0 && Math.min(es, en) / Math.max(es, en) > 0.3) return "mixed";
  return es > en ? "es" : "en";
}

export function keywordTriage(ticket: TicketInput): Triage {
  const text = `${ticket.subject}\n${ticket.description}`;
  const category = CATEGORY_KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? "other";
  const impact: Impact = /whole office|toda la oficina|entire|everyone in|nadie|nobody|none of|ninguna|todos/iu.test(text)
    ? /office|oficina|company|compañ/iu.test(text) ? "whole_org" : "multiple_users"
    : "single_user";
  const urgency: Urgency = /urgent|asap|now|today|deadline|can'?t work|urgente|no puedo trabajar|hoy|ya /iu.test(text)
    ? "high"
    : /how do i|c[oó]mo|question|pregunta/iu.test(text) ? "low" : "medium";
  const language = detectLanguage(text);
  const kb = KB_FOR[category] ?? "none";
  const needs = category === "security" || category === "access_request" || category === "other" || impact !== "single_user";
  const spanish = language === "es";
  return {
    language,
    category,
    impact,
    urgency,
    kb_article: kb,
    needs_technician: needs,
    technician_reasons: needs ? ["technician_work_needed"] : [],
    suspicious_instructions: /ignore (all )?previous instructions|admin mode/iu.test(text),
    summary_en: `Keyword match: ${category}.`,
    draft_reply: spanish
      ? "Hola, gracias por escribirnos. Abajo están los pasos que suelen resolver esto. Si no funciona, responde a este ticket."
      : "Hi, thanks for reaching out. The steps below usually fix this. If they don't, reply to this ticket.",
    confidence: "medium",
  };
}

export async function fakeTriage(ticket: TicketInput): Promise<TriageResult> {
  const { safe, redactions, sentText } = prepareTicket(ticket);
  return finalize(keywordTriage(safe), { redactions, sentText }, { model: "keyword-rules", usage: null, costUsd: 0 });
}
