# Help Desk Triage Assistant (English / Spanish)

An AI assistant for an IT service desk. It reads new ServiceNow incidents written in English, Spanish or a mix of both, and for each one suggests:

- a **category**, **impact** and **urgency** (priority is then worked out by a fixed ServiceNow-style table, not by the AI),
- the **knowledge-base article** that fits, from 15 bilingual articles,
- a **draft reply** in the user's own language,
- whether a **technician must handle it**, and why.

A technician reviews every suggestion. Nothing is written to ServiceNow until they approve it, and the reply goes to the user only when they choose to send it.

> Built by Melvin Carmona Ortiz with Claude Code. Model: Claude Haiku 5.5 through the Claude API.

## Why this exists

AI is taking over simple Tier 1 work (password resets, how-to questions). The work that's growing is the work around the AI: deciding what it may do on its own, checking its mistakes, and making sure the tickets that need a person reach one. This project is built around that job:

- **The AI suggests, code decides.** Rules in plain code ([src/policy.ts](src/policy.ts)) send a ticket to a person whatever the AI says: security events, access changes, priority 1-2, low confidence, languages other than English/Spanish, pasted secrets, or a draft reply that fails the safety check.
- **Measured, not assumed.** A 60-ticket test set with answer keys ([evals/tickets.json](evals/tickets.json)) scores every change. The number that matters most is **needs-a-person recall**: of the tickets that needed a technician, how many were flagged.
- **Safe by default.** Secrets are removed before the AI sees a ticket, the user's name is never sent, ticket text is treated as data (not instructions), and the KB steps in replies are pasted by code from approved articles, so the AI can't invent steps.

More detail: [docs/GUARDRAILS.md](docs/GUARDRAILS.md).

## Results

| Test split (40 tickets the prompt was never tuned on) | Keyword rules (baseline) | Claude Haiku 5.5 |
|---|---|---|
| Needs-a-person recall | 73.9% | _pending first real run_ |
| Needs-a-person precision | 100% | _pending_ |
| Category accuracy | 80% | _pending_ |
| Priority exact (within one level) | 45% (92.5%) | _pending_ |
| KB article accuracy | 50% | _pending_ |
| Language accuracy | 92.5% | _pending_ |
| Secrets sent to the AI | 0 | _pending_ |

The baseline is a set of English/Spanish keyword rules ([src/fake-triage.ts](src/fake-triage.ts)). It was written while looking at the same tickets, so it is an optimistic baseline. It still misses 10 of the 33 tickets that need a person (for example a lost MFA phone, repeat lockouts, a swollen battery), which is the gap the AI has to close.

A full run of all 60 tickets on Claude Haiku 5.5 costs about $0.03.

## How it works

```
ServiceNow incident (new)
        |
        v
 redact secrets  ------------------------------->  (passwords, codes, SSNs, card numbers never leave)
        |
        v
 Claude Haiku 5.5  -- structured output (Zod schema) -->  category, impact, urgency, KB, draft reply, reasons
        |
        v
 checks in code:  schema valid? refused? cut off?  -> if anything failed: "triage by hand"
        |
        v
 priority table (impact x urgency)  +  policy rules  -->  needs a technician? why?
        |
        v
 technician review screen:  [a] approve  [r] approve + send reply  [e] edit  [s] skip
        |
        v
 ServiceNow: impact, urgency, category, internal work note  (+ customer reply only on "send")
```

| Piece | File |
|---|---|
| Claude call and failure handling | [src/triage.ts](src/triage.ts) |
| Answer schema | [src/schema.ts](src/schema.ts) |
| Instructions to the model | [src/prompt.ts](src/prompt.ts) |
| Guardrail rules | [src/policy.ts](src/policy.ts) |
| Secret removal | [src/redact.ts](src/redact.ts) |
| Priority table | [src/priority.ts](src/priority.ts) |
| ServiceNow REST client | [src/servicenow.ts](src/servicenow.ts) |
| Review screen | [scripts/review.ts](scripts/review.ts) |
| Accuracy test | [scripts/run-eval.ts](scripts/run-eval.ts), [src/eval-score.ts](src/eval-score.ts) |
| Knowledge base (EN/ES) | [kb/articles.json](kb/articles.json) |

## Run it

Needs Node.js 20 or newer.

```bash
npm install
npm test                 # 40 unit tests, no API key needed
npm run eval:fake        # free: score the keyword baseline on all 60 tickets
npm run review -- --source file --fake    # free: try the review screen on sample tickets
```

With a Claude API key in `.env` (copy `.env.example`):

```bash
npm run estimate         # shows the cost first, spends nothing
npm run eval -- --yes    # real accuracy run (about $0.03; stops at $0.50)
npm run review -- --source file           # review screen with real AI suggestions, nothing is written
```

With a ServiceNow developer instance (free, see [docs/SERVICENOW-SETUP.md](docs/SERVICENOW-SETUP.md)):

```bash
npm run sn:check         # test the connection (read-only)
npm run sn:kb -- --yes   # copy the 15 EN/ES articles into the instance as drafts
npm run sn:seed -- --yes # create 8 demo incidents
npm run review           # triage new incidents; approve to write back
```

## What I'd do next

- Read the full KB article text into the prompt (with prompt caching) if article choice is the weak spot.
- Let ServiceNow call the assistant when an incident is created (Business Rule or Flow Designer + REST), instead of the technician starting the review.
- Track how often technicians change the AI's suggestion, and add those tickets to the test set.

## License

MIT
