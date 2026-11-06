// Create demo incidents in YOUR developer instance from the sample tickets,
// so the review screen has something real to work on.
//   npm run sn:seed              shows what it would create
//   npm run sn:seed -- --yes     creates them (8 by default; --count N to change)
import { readFileSync } from "node:fs";
import { argValue, hasArg, loadEnv } from "../src/env";
import { ServiceNowClient, ServiceNowError, configFromEnv } from "../src/servicenow";
import type { EvalTicket } from "../src/eval-score";

loadEnv();
// A varied demo set: English, Spanish, mixed, an outage, a phishing report,
// a prompt-injection attempt and a ticket with a pasted password.
const DEMO_IDS = ["T001", "T002", "T009", "T023", "T039", "T045", "T047", "T050"];

const count = Number(argValue("--count") ?? DEMO_IDS.length);
const tickets: EvalTicket[] = JSON.parse(readFileSync("evals/tickets.json", "utf8"));
const chosen = tickets.filter((t) => DEMO_IDS.includes(t.id)).slice(0, count);

for (const t of chosen) console.log(`${t.id}  ${t.subject}`);
if (!hasArg("--yes")) {
  console.log(`\n${chosen.length} demo incidents would be created. Add --yes to create them.`);
  process.exit(0);
}
try {
  const config = configFromEnv();
  if (!config) throw new ServiceNowError("Missing SN_INSTANCE, SN_USER or SN_PASSWORD in .env.");
  const sn = new ServiceNowClient(config);
  for (const t of chosen) {
    const r = await sn.createIncident({ short_description: t.subject, description: t.description });
    console.log(`Created ${r.number} from ${t.id}`);
  }
} catch (err) {
  console.error(err instanceof ServiceNowError ? err.message : err);
  process.exit(1);
}
