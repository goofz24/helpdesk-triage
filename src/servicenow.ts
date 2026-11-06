// A small client for the ServiceNow Table API (REST), using built-in fetch.
//
// Reads: new incidents. Writes (only after a technician approves in the review
// screen): impact, urgency, category and an internal work note, plus a
// customer-visible comment if the technician chooses to send the reply.
// It never closes, reassigns or deletes anything.
import type { Category } from "./schema";

export type ServiceNowConfig = { instanceUrl: string; user: string; password: string };
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type Incident = {
  sys_id: string;
  number: string;
  short_description: string;
  description: string;
  caller: string;
  opened_at: string;
};

export class ServiceNowError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ServiceNowError";
  }
}

// Our categories -> ServiceNow's default incident categories.
export const SN_CATEGORY: Record<Category, { category: string; subcategory?: string }> = {
  password_mfa: { category: "inquiry" },
  account_access: { category: "inquiry" },
  access_request: { category: "inquiry" },
  security: { category: "inquiry" },
  other: { category: "inquiry" },
  network_vpn: { category: "network" },
  email_outlook: { category: "software", subcategory: "email" },
  software: { category: "software" },
  printer: { category: "hardware" },
  hardware: { category: "hardware" },
};

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ServiceNowConfig | null {
  const instanceUrl = env.SN_INSTANCE?.trim().replace(/\/+$/, "");
  const user = env.SN_USER?.trim();
  const password = env.SN_PASSWORD;
  if (!instanceUrl || !user || !password) return null;
  if (!/^https:\/\/[a-z0-9-]+\.service-now\.com$/i.test(instanceUrl)) {
    throw new ServiceNowError(`SN_INSTANCE should look like https://dev12345.service-now.com (got "${instanceUrl}")`);
  }
  return { instanceUrl, user, password };
}

type DisplayValue = string | { display_value?: string; value?: string } | undefined;
const show = (v: DisplayValue): string => (typeof v === "object" && v ? (v.display_value ?? v.value ?? "") : (v ?? ""));

export class ServiceNowClient {
  private readonly auth: string;

  constructor(private readonly config: ServiceNowConfig, private readonly fetchImpl: FetchLike = fetch) {
    this.auth = "Basic " + Buffer.from(`${config.user}:${config.password}`).toString("base64");
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.instanceUrl}${path}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: { Authorization: this.auth, Accept: "application/json", "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new ServiceNowError(`Could not reach ServiceNow: ${(err as Error).message}`);
    }
    if (res.status === 401) throw new ServiceNowError("ServiceNow rejected the user name or password (401)", 401);
    if (res.status === 403) throw new ServiceNowError("This ServiceNow user isn't allowed to do that (403)", 403);
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      // A sleeping developer instance answers with an HTML page instead of JSON.
      throw new ServiceNowError(
        "ServiceNow answered with a web page, not data. The developer instance is probably asleep: wake it at developer.servicenow.com, then try again.",
        res.status,
      );
    }
    if (!res.ok) {
      const msg = (json as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
      throw new ServiceNowError(`ServiceNow error: ${msg}`, res.status);
    }
    return (json as { result: T }).result;
  }

  // New, active incidents, newest first.
  async listNewIncidents(limit = 10): Promise<Incident[]> {
    const params = new URLSearchParams({
      sysparm_query: "active=true^state=1^ORDERBYDESCsys_created_on",
      sysparm_limit: String(limit),
      sysparm_fields: "sys_id,number,short_description,description,caller_id,opened_at",
      sysparm_display_value: "true",
    });
    const rows = await this.request<Record<string, DisplayValue>[]>("GET", `/api/now/table/incident?${params}`);
    return rows.map((r) => ({
      sys_id: show(r.sys_id),
      number: show(r.number),
      short_description: show(r.short_description),
      description: show(r.description),
      caller: show(r.caller_id),
      opened_at: show(r.opened_at),
    }));
  }

  async applyTriage(
    sysId: string,
    update: { impact: 1 | 2 | 3; urgency: 1 | 2 | 3; category: Category; workNote: string },
  ): Promise<void> {
    const sn = SN_CATEGORY[update.category];
    await this.request("PATCH", `/api/now/table/incident/${encodeURIComponent(sysId)}`, {
      impact: String(update.impact),
      urgency: String(update.urgency),
      category: sn.category,
      ...(sn.subcategory ? { subcategory: sn.subcategory } : {}),
      work_notes: update.workNote,
    });
  }

  // Customer-visible comment: only called when the technician chooses "send".
  async sendReply(sysId: string, reply: string): Promise<void> {
    await this.request("PATCH", `/api/now/table/incident/${encodeURIComponent(sysId)}`, { comments: reply });
  }

  async createIncident(fields: { short_description: string; description: string }): Promise<{ sys_id: string; number: string }> {
    const r = await this.request<Record<string, DisplayValue>>("POST", "/api/now/table/incident", {
      ...fields,
      contact_type: "self-service",
    });
    return { sys_id: show(r.sys_id), number: show(r.number) };
  }

  async findKnowledgeBase(title: string): Promise<string | null> {
    const params = new URLSearchParams({ sysparm_query: `title=${title}`, sysparm_limit: "1", sysparm_fields: "sys_id,title" });
    const rows = await this.request<{ sys_id: string }[]>("GET", `/api/now/table/kb_knowledge_base?${params}`);
    return rows[0]?.sys_id ?? null;
  }

  async createKbArticle(fields: { kbSysId: string; title: string; html: string }): Promise<string> {
    const r = await this.request<Record<string, DisplayValue>>("POST", "/api/now/table/kb_knowledge", {
      kb_knowledge_base: fields.kbSysId,
      short_description: fields.title,
      text: fields.html,
      workflow_state: "draft",
    });
    return show(r.number);
  }

  async ping(): Promise<number> {
    const params = new URLSearchParams({ sysparm_limit: "1", sysparm_fields: "sys_id" });
    const rows = await this.request<unknown[]>("GET", `/api/now/table/incident?${params}`);
    return rows.length;
  }
}
