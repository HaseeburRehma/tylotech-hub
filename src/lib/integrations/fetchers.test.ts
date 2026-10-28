import { describe, expect, it } from "vitest";
import { metaLeads } from "./fetchers";

describe("metaLeads", () => {
  it("prefers the aggregate lead action regardless of order", () => {
    expect(metaLeads([{ action_type: "offsite_conversion.fb_pixel_lead", value: "3" }, { action_type: "lead", value: "5" }])).toBe(5);
    expect(metaLeads([{ action_type: "lead", value: "5" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "3" }])).toBe(5);
  });
  it("falls back to specific types in priority order, never summing", () => {
    expect(metaLeads([{ action_type: "offsite_conversion.fb_pixel_lead", value: "2" }, { action_type: "onsite_conversion.lead_grouped", value: "4" }])).toBe(4);
  });
  it("never counts Meta's *_add_meta_leads events (content views, searches) as leads", () => {
    // Light of Hope, Oct 2026: 556 content views, 0 real leads.
    expect(metaLeads([{ action_type: "offsite_content_view_add_meta_leads", value: "556" }, { action_type: "link_click", value: "90" }])).toBe(0);
    expect(metaLeads([{ action_type: "offsite_search_add_meta_leads", value: "12" }, { action_type: "offsite_complete_registration_add_meta_leads", value: "30" }])).toBe(0);
  });
  it("falls back to other real lead events (custom conversions ending in lead)", () => {
    expect(metaLeads([{ action_type: "offsite_conversion.custom.123_lead", value: "7" }, { action_type: "offsite_content_view_add_meta_leads", value: "500" }])).toBe(7);
    expect(metaLeads([{ action_type: "onsite_conversion.messaging_lead_grouped", value: "4" }])).toBe(4);
  });
  it("still uses the aggregate when Meta sends it alongside the noise (Nouh-Wehres)", () => {
    expect(
      metaLeads([
        { action_type: "offsite_content_view_add_meta_leads", value: "3" },
        { action_type: "lead", value: "3" },
        { action_type: "onsite_conversion.lead_grouped", value: "3" },
      ]),
    ).toBe(3);
  });
  it("is 0 without lead actions", () => {
    expect(metaLeads([{ action_type: "link_click", value: "40" }])).toBe(0);
    expect(metaLeads(undefined)).toBe(0);
  });
});

describe("fetchGoogleAds request", () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const run = async (env: Record<string, string | undefined>, login?: string | null) => {
    calls.length = 0;
    const prev = { t: process.env.GOOGLE_ADS_DEVELOPER_TOKEN, l: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID };
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = env.token;
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = env.login;
    if (env.token === undefined) delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (env.login === undefined) delete process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    const orig = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return new Response("[]", { status: 200 });
    }) as typeof fetch;
    try {
      const { fetchGoogleAds } = await import("./fetchers");
      return await fetchGoogleAds("at", "185-986-0474", login);
    } finally {
      globalThis.fetch = orig;
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN = prev.t;
      process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = prev.l;
      if (prev.t === undefined) delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      if (prev.l === undefined) delete process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    }
  };

  it("works without a developer token (Google dropped them) and uses the account's manager id", async () => {
    await run({}, "132-838-6899");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/customers/1859860474/googleAds:searchStream");
    expect(calls[0].headers["developer-token"]).toBeUndefined();
    expect(calls[0].headers["login-customer-id"]).toBe("1328386899");
  });
  it("still sends a configured token; env manager id is the fallback; never the account itself", async () => {
    await run({ token: "dev", login: "1328386899" });
    expect(calls[0].headers["developer-token"]).toBe("dev");
    expect(calls[0].headers["login-customer-id"]).toBe("1328386899");
    await run({}, "185-986-0474");
    expect(calls[0].headers["login-customer-id"]).toBeUndefined();
  });
  it("does nothing without a token or account", async () => {
    calls.length = 0;
    const { fetchGoogleAds } = await import("./fetchers");
    expect(await fetchGoogleAds("", "185-986-0474")).toBeNull();
    expect(await fetchGoogleAds("at", "")).toBeNull();
  });
});

describe("findGoogleAdsManager", () => {
  const withFetch = async (handler: (url: string, init?: RequestInit) => Response, fn: () => Promise<unknown>) => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async (u: string, i?: RequestInit) => handler(u, i)) as typeof fetch;
    try {
      return await fn();
    } finally {
      globalThis.fetch = orig;
    }
  };
  const list = (ids: string[]) => new Response(JSON.stringify({ resourceNames: ids.map((i) => `customers/${i}`) }));

  it("direct access → empty string (no login-customer-id)", async () => {
    const { findGoogleAdsManager } = await import("./fetchers");
    expect(await withFetch(() => list(["1859860474"]), () => findGoogleAdsManager("at", "185-986-0474"))).toBe("");
  });
  it("through the TyloTech manager → its id", async () => {
    const { findGoogleAdsManager } = await import("./fetchers");
    const seen: string[] = [];
    const r = await withFetch(
      (url, init) => {
        if (url.endsWith("listAccessibleCustomers")) return list(["9999999999", "1328386899"]);
        const mgr = (init?.headers as Record<string, string>)["login-customer-id"];
        seen.push(mgr);
        expect(String(init?.body)).toContain("customer_client.id = 1859860474");
        return new Response(JSON.stringify(mgr === "1328386899" ? { results: [{ customerClient: { id: "1859860474" } }] } : { results: [] }));
      },
      () => findGoogleAdsManager("at", "185-986-0474"),
    );
    expect(r).toBe("1328386899");
    expect(seen).toEqual(["9999999999", "1328386899"]);
  });
  it("no access or API error → undefined (try again next sync)", async () => {
    const { findGoogleAdsManager } = await import("./fetchers");
    expect(await withFetch(() => new Response("{}", { status: 403 }), () => findGoogleAdsManager("at", "185-986-0474"))).toBeUndefined();
    expect(await withFetch((u) => (u.endsWith("listAccessibleCustomers") ? list(["1"]) : new Response("{}", { status: 403 })), () => findGoogleAdsManager("at", "185-986-0474"))).toBeUndefined();
    expect(await findGoogleAdsManager("", "185-986-0474")).toBeUndefined();
  });
});

describe("Google Ads errors are readable", () => {
  const withRes = async (status: number, body: unknown) => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
    try {
      const { fetchGoogleAds } = await import("./fetchers");
      return (await fetchGoogleAds("at", "185-986-0474", "1328386899")) as { error: string; detail?: string };
    } finally {
      globalThis.fetch = orig;
    }
  };
  it("access level / developer token: shows the code, doesn't ask to sign in again", async () => {
    const r = await withRes(403, [{ error: { code: 403, status: "PERMISSION_DENIED", message: "The caller does not have permission", details: [{ errors: [{ errorCode: { authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED" }, message: "The developer token is only approved for use with test accounts." }] }] } }]);
    expect(r).toEqual({ error: "api", detail: "DEVELOPER_TOKEN_NOT_APPROVED: The developer token is only approved for use with test accounts." });
  });
  it("API switched off in Google Cloud: api error with the reason", async () => {
    const r = await withRes(403, { error: { code: 403, status: "PERMISSION_DENIED", message: "Google Ads API has not been used in project 996657864136 before or it is disabled. SERVICE_DISABLED" } });
    expect(r.error).toBe("api");
    expect(r.detail).toMatch(/SERVICE_DISABLED/);
  });
  it("a really expired sign-in stays an auth error", async () => {
    expect((await withRes(401, { error: { code: 401, status: "UNAUTHENTICATED", message: "Request had invalid authentication credentials." } })).error).toBe("auth");
  });
});

describe("KPIs that would mislead are left out", () => {
  const withFetch = async <T,>(answer: (url: string, body: any) => unknown, run: () => Promise<T>) => {
    const orig = globalThis.fetch;
    const bodies: any[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      bodies.push({ url: String(url), body });
      return new Response(JSON.stringify(answer(String(url), body)), { status: 200 });
    }) as typeof fetch;
    try {
      return { result: await run(), bodies };
    } finally {
      globalThis.fetch = orig;
    }
  };
  const today = new Date();
  const day = (n: number) => new Date(today.getTime() - n * 86_400_000).toISOString().slice(0, 10);

  it("Meta: spend without leads or purchases → no 'cost per lead €0' and no 'ROAS 0'", async () => {
    const { fetchMetaAds } = await import("./fetchers");
    const { result } = await withFetch(() => ({ data: [{ date_start: day(2), spend: "50" }, { date_start: day(3), spend: "40" }] }), () => fetchMetaAds("t", "act_1"));
    const names = (result as any).kpis.map((k: any) => k.metric_name);
    expect(names).toEqual(["ad_spend", "leads"]);
  });

  it("Meta: with leads the cost per lead is shown", async () => {
    const { fetchMetaAds } = await import("./fetchers");
    const { result } = await withFetch(() => ({ data: [{ date_start: day(2), spend: "50", actions: [{ action_type: "lead", value: "5" }] }] }), () => fetchMetaAds("t", "act_1"));
    expect((result as any).kpis.find((k: any) => k.metric_name === "cpl").value).toBe(10);
  });

  it("Search Console asks for fresh data too (else the last 1-2 days are missing)", async () => {
    const { fetchSearchConsole } = await import("./fetchers");
    const { bodies } = await withFetch((_u, b) => (b?.dimensions?.[0] === "date" ? { rows: [{ keys: [day(1)], clicks: 3, impressions: 40, position: 5 }] } : { rows: [] }), () => fetchSearchConsole("t", "sc-domain:example.org"));
    const q = bodies.filter((b) => b.url.includes("searchAnalytics"));
    expect(q.length).toBeGreaterThan(0);
    expect(q.every((b) => b.body.dataState === "all")).toBe(true);
  });
});
