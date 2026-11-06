import { describe, expect, it } from "vitest";
import { ServiceNowClient, ServiceNowError, configFromEnv } from "../src/servicenow";

const config = { instanceUrl: "https://dev12345.service-now.com", user: "admin", password: "pw" };

function mockFetch(status: number, body: string, calls: { url: string; init?: RequestInit }[] = []) {
  return async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(body, { status, headers: { "Content-Type": "application/json" } });
  };
}

describe("ServiceNow client", () => {
  it("reads new incidents and uses basic auth", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const body = JSON.stringify({
      result: [
        {
          sys_id: "abc",
          number: "INC0010001",
          short_description: "VPN",
          description: "fails",
          caller_id: { display_value: "Tom Alvarez", link: "x" },
          opened_at: "2026-11-06 10:00:00",
        },
      ],
    });
    const sn = new ServiceNowClient(config, mockFetch(200, body, calls));
    const list = await sn.listNewIncidents(5);
    expect(list).toEqual([
      { sys_id: "abc", number: "INC0010001", short_description: "VPN", description: "fails", caller: "Tom Alvarez", opened_at: "2026-11-06 10:00:00" },
    ]);
    expect(calls[0].url).toContain("/api/now/table/incident?");
    expect(decodeURIComponent(calls[0].url)).toContain("state=1");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("admin:pw").toString("base64")}`);
  });

  it("writes impact, urgency, category and a work note on approval", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const sn = new ServiceNowClient(config, mockFetch(200, JSON.stringify({ result: {} }), calls));
    await sn.applyTriage("abc", { impact: 3, urgency: 2, category: "email_outlook", workNote: "note" });
    expect(calls[0].init?.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      impact: "3",
      urgency: "2",
      category: "software",
      subcategory: "email",
      work_notes: "note",
    });
  });

  it("explains a wrong password", async () => {
    const sn = new ServiceNowClient(config, mockFetch(401, "{}"));
    await expect(sn.ping()).rejects.toThrow(/user name or password/);
  });

  it("explains a sleeping developer instance", async () => {
    const sn = new ServiceNowClient(config, mockFetch(200, "<html>Your instance is hibernating</html>"));
    await expect(sn.ping()).rejects.toThrow(/asleep/);
  });

  it("passes ServiceNow's own error message along", async () => {
    const sn = new ServiceNowClient(config, mockFetch(400, JSON.stringify({ error: { message: "Invalid table" } })));
    await expect(sn.ping()).rejects.toThrow(/Invalid table/);
  });

  it("reads and checks settings from the environment", () => {
    expect(configFromEnv({})).toBeNull();
    expect(configFromEnv({ SN_INSTANCE: "https://dev1.service-now.com/", SN_USER: "a", SN_PASSWORD: "b" })?.instanceUrl).toBe(
      "https://dev1.service-now.com",
    );
    expect(() => configFromEnv({ SN_INSTANCE: "http://evil.example.com", SN_USER: "a", SN_PASSWORD: "b" })).toThrow(ServiceNowError);
  });
});
