// Copy the 15 bilingual KB articles into your developer instance's "IT"
// knowledge base as drafts (one English and one Spanish article each).
//   npm run sn:kb              shows what it would create
//   npm run sn:kb -- --yes     creates them
import { argValue, hasArg, loadEnv } from "../src/env";
import { KB_ARTICLES } from "../src/kb";
import { ServiceNowClient, ServiceNowError, configFromEnv } from "../src/servicenow";

loadEnv();
const kbTitle = argValue("--kb") ?? "IT";
const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const toHtml = (body: string) =>
  body
    .split("\n")
    .map((line) => `<p>${line.replace(/[&<>]/g, (c) => ESCAPES[c] ?? c)}</p>`)
    .join("");

console.log(`${KB_ARTICLES.length * 2} draft articles (EN + ES) for the "${kbTitle}" knowledge base.`);
if (!hasArg("--yes")) {
  console.log("Add --yes to create them.");
  process.exit(0);
}
try {
  const config = configFromEnv();
  if (!config) throw new ServiceNowError("Missing SN_INSTANCE, SN_USER or SN_PASSWORD in .env.");
  const sn = new ServiceNowClient(config);
  const kbSysId = await sn.findKnowledgeBase(kbTitle);
  if (!kbSysId) throw new ServiceNowError(`No knowledge base titled "${kbTitle}". Use --kb "<title>" with one that exists.`);
  for (const a of KB_ARTICLES) {
    const en = await sn.createKbArticle({ kbSysId, title: `[${a.id}] ${a.title_en}`, html: toHtml(a.body_en) });
    const es = await sn.createKbArticle({ kbSysId, title: `[${a.id}] ${a.title_es}`, html: toHtml(a.body_es) });
    console.log(`${a.id}: ${en} (EN), ${es} (ES)`);
  }
} catch (err) {
  console.error(err instanceof ServiceNowError ? err.message : err);
  process.exit(1);
}
