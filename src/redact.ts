// Remove secrets from a ticket BEFORE it is sent to the AI or written to logs.
// Users sometimes paste their password into a ticket ("my password is ...").
// That password must never leave our system, and the account needs a reset.

export type RedactionKind = "password" | "verification_code" | "ssn" | "card_number";
export type RedactResult = { text: string; found: RedactionKind[] };

// "password is X", "contraseña: X", "senha = X" ... The secret must look like a
// real password (6+ characters with a digit or symbol) so normal sentences
// such as "my password is not working" are left alone.
const PASSWORD_RE =
  /\b(password|passwd|pwd|pass|contraseña|contrasena|clave|senha|mot de passe)(\s+(?:is|was|es|era|é)\s*:?\s*|\s*[:=]\s*)(\S{6,})/giu;
const CODE_RE = /\b(code|código|codigo)(\s+(?:is|es)\s*:?\s*|\s*[:=]\s*)(\d{6,8})\b/giu;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const CARD_RE = /\b(?:\d[ -]?){13,16}\b/g;

function looksLikeSecret(token: string): boolean {
  return /[\d\W_]/u.test(token.replace(/[.,;!?)]+$/u, "x"));
}

export function redact(input: string): RedactResult {
  const found = new Set<RedactionKind>();
  let text = input.replace(PASSWORD_RE, (match, word: string, sep: string, secret: string) => {
    if (!looksLikeSecret(secret)) return match;
    found.add("password");
    return `${word}${sep}[REDACTED]`;
  });
  text = text.replace(CODE_RE, (_m, word: string, sep: string) => {
    found.add("verification_code");
    return `${word}${sep}[REDACTED]`;
  });
  text = text.replace(SSN_RE, () => {
    found.add("ssn");
    return "[REDACTED]";
  });
  text = text.replace(CARD_RE, (m) => {
    if (m.replace(/\D/g, "").length < 13) return m;
    found.add("card_number");
    return "[REDACTED]";
  });
  return { text, found: [...found] };
}
