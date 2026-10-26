import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sendPush } from "./push";

const ROLES: Record<string, string> = { client1: "client", staff1: "team", admin1: "admin" };
let sent: any[] = [];

const admin: any = {
  from: (t: string) => ({
    select: () => ({
      in: async (_col: string, ids: string[]) =>
        t === "users"
          ? { data: ids.map((id) => ({ id, role: ROLES[id] })) }
          : { data: ids.map((id) => ({ expo_token: `ExponentPushToken[${id}]` })), error: null },
    }),
    delete: () => ({ in: async () => ({}) }),
  }),
};

beforeEach(() => {
  sent = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
    sent.push(...JSON.parse(init.body));
    return new Response(JSON.stringify({ data: [] }));
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("sendPush", () => {
  it("staff phones get lead pushes (urgent: high priority, leads channel)", async () => {
    await sendPush(admin, ["client1", "staff1", "admin1"], { title: "Neuer Lead", type: "lead", urgent: true, href: "/leads?lead=x", data: { leadId: "x" } });
    expect(sent.map((m) => m.to).sort()).toEqual(["ExponentPushToken[admin1]", "ExponentPushToken[client1]", "ExponentPushToken[staff1]"]);
    expect(sent[0]).toMatchObject({ priority: "high", channelId: "leads", ttl: 300, data: { leadId: "x", href: "/leads?lead=x", type: "lead" } });
  });

  it("staff phones still don't get chat pushes", async () => {
    await sendPush(admin, ["client1", "staff1"], { title: "Neue Nachricht", type: "message", body: "secret text" });
    expect(sent.map((m) => m.to)).toEqual(["ExponentPushToken[client1]"]);
    expect(sent[0].body).toBeUndefined(); // chat text never goes through push
    expect(sent[0].priority).toBeUndefined();
  });

  it("an app-supplied href can't be overridden through data", async () => {
    await sendPush(admin, ["client1"], { title: "x", type: "lead", href: "/leads", data: { href: "https://evil.example" } as any });
    expect(sent[0].data.href).toBe("/leads");
  });
});
