# Guardrails: what the AI may and may not do

The assistant only **suggests**. A technician approves every change. On top of that, these rules are enforced in code, so they hold even when the model gets something wrong.

## What the AI never does

| Never | How it's enforced |
|---|---|
| Reset passwords, unlock accounts, grant access, install software | It has no tools and no ServiceNow access. Only the review screen writes, and only after a technician presses a key. |
| See secrets a user pasted | [src/redact.ts](../src/redact.ts) removes passwords, verification codes, SSNs and card numbers before the ticket is sent. The ticket is then forced to a person so the account gets a reset. |
| See who the user is | Only the subject and description are sent, not the caller's name. |
| Follow orders hidden in a ticket | The prompt says ticket text is data. Ticket text is wrapped in tags, and fake closing tags are neutralized. If the model notices orders ("ignore previous instructions", "grant admin"), the ticket goes to a person. |
| Ask a user for a password or code | [src/policy.ts](../src/policy.ts) checks every draft reply in English and Spanish. A failed check sends the ticket to a person. |
| Claim work was done ("I've reset your password") | Same reply check. |
| Invent fix steps | The AI picks an article ID from a fixed list. The steps in the reply are pasted by code from [kb/articles.json](../kb/articles.json). |
| Set the priority directly | The AI judges impact and urgency; a fixed table turns them into priority, like ServiceNow's default lookup. |

## Tickets that always go to a person

Any one of these sends the ticket to a technician, whatever the AI said:

1. Category **security** (phishing, clicked links, malware, lost or stolen devices).
2. Category **access_request** (permissions, admin rights, shared mailboxes, paid licenses): someone has to approve.
3. **Priority 1 or 2** (outages, several people affected and urgent).
4. AI **confidence low**.
5. **Suspicious instructions** in the ticket.
6. A language other than English or Spanish (no approved reply templates).
7. **No KB article** fits, or category **other**.
8. A **secret** was pasted in the ticket.
9. The draft reply **failed the safety check**.
10. The AI step **failed** (API error, refusal, cut-off answer, or an answer that doesn't match the schema). In that case there is no guessed category at all.

The AI can also send a ticket to a person on its own judgment (upset users, identity checks, broken hardware...). Code rules can only add reasons, never remove the AI's.

## Why "needs a person" recall is the main number

Two kinds of mistakes are possible:

- **Missed a person:** a ticket that needed a technician got only a KB article. The user waits, or a security event is missed. This is the expensive mistake.
- **Extra person:** a simple ticket went to a technician. It costs a few minutes.

So the system is tuned to catch every ticket that needs a person first, and only then to send fewer simple tickets to people.

## Known limits

- The keyword checks for unsafe replies are simple patterns. They catch common phrasings in English and Spanish, not every possible wording. The technician review is the real safety net.
- The test set is 60 tickets written for this project, not real company data.
- The Spanish is Puerto Rico-friendly but neutral; other dialects weren't tested.
