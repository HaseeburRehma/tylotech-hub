import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuthUser = vi.fn();
const mockCreateClient = vi.fn();
const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/auth", () => ({ getAuthUser: () => mockGetAuthUser() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => mockCreateClient() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mockCreateAdminClient() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { POST, DELETE } from "./route";
import { STAFF_USER, CLIENT_USER } from "@/test-utils";

function adminSb(uploadError: unknown = null, insertData: unknown = { id: "doc-1" }) {
  const chain: Record<string, any> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.single = vi.fn().mockResolvedValue({ data: insertData, error: null });
  return {
    from: vi.fn(() => chain),
    storage: { from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ error: uploadError }), remove: vi.fn() })) },
    _chain: chain,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/documents — security", () => {
  it("returns 401 for unauthenticated users", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const form = new FormData();
    form.append("file", new File(["data"], "test.pdf"));
    const res = await POST(new Request("http://localhost/api/documents", { method: "POST", body: form }));
    expect(res.status).toBe(401);
  });

  it("blocks HTML file uploads (XSS prevention)", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const admin = adminSb();
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateClient.mockReturnValue(admin);
    const form = new FormData();
    form.append("file", new File(["<script>alert(1)</script>"], "evil.html", { type: "text/html" }));
    form.append("clientId", "c1");
    const res = await POST(new Request("http://localhost/api/documents", { method: "POST", body: form }));
    expect(res.status).toBe(415);
  });

  it("blocks SVG file uploads (XSS via SVG)", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockCreateAdminClient.mockReturnValue(adminSb());
    mockCreateClient.mockReturnValue(adminSb());
    const form = new FormData();
    form.append("file", new File(["<svg onload=alert(1)>"], "evil.svg", { type: "image/svg+xml" }));
    form.append("clientId", "c1");
    const res = await POST(new Request("http://localhost/api/documents", { method: "POST", body: form }));
    expect(res.status).toBe(415);
  });

  it("blocks JS file uploads", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockCreateAdminClient.mockReturnValue(adminSb());
    mockCreateClient.mockReturnValue(adminSb());
    const form = new FormData();
    form.append("file", new File(["alert(1)"], "payload.js", { type: "application/javascript" }));
    form.append("clientId", "c1");
    const res = await POST(new Request("http://localhost/api/documents", { method: "POST", body: form }));
    expect(res.status).toBe(415);
  });

  it("server overrides client's clientId with their own tenant", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    const admin = adminSb();
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateClient.mockReturnValue(admin);
    const form = new FormData();
    form.append("file", new File(["data"], "report.pdf", { type: "application/pdf" }));
    form.append("clientId", "tenant-b");
    const res = await POST(new Request("http://localhost/api/documents", { method: "POST", body: form }));
    expect(res.status).toBe(200);
    const insertCall = admin._chain.insert.mock.calls[0]?.[0];
    expect(insertCall.client_id).toBe("tenant-a");
  });

  it("forces client uploads to type 'asset' regardless of input", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    const admin = adminSb();
    mockCreateAdminClient.mockReturnValue(admin);
    mockCreateClient.mockReturnValue(admin);
    const form = new FormData();
    form.append("file", new File(["data"], "report.pdf", { type: "application/pdf" }));
    form.append("type", "contract");
    const res = await POST(new Request("http://localhost/api/documents", { method: "POST", body: form }));
    expect(res.status).toBe(200);
    const insertCall = admin._chain.insert.mock.calls[0]?.[0];
    expect(insertCall.type).toBe("asset");
  });

  it("rejects files over 15 MB", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockCreateAdminClient.mockReturnValue(adminSb());
    mockCreateClient.mockReturnValue(adminSb());
    const bigData = new Uint8Array(15 * 1024 * 1024 + 1);
    const form = new FormData();
    form.append("file", new File([bigData], "big.pdf", { type: "application/pdf" }));
    form.append("clientId", "c1");
    const res = await POST(new Request("http://localhost/api/documents", { method: "POST", body: form }));
    expect(res.status).toBe(413);
  });

  it("returns 400 when no file is provided", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockCreateAdminClient.mockReturnValue(adminSb());
    mockCreateClient.mockReturnValue(adminSb());
    const form = new FormData();
    form.append("clientId", "c1");
    const res = await POST(new Request("http://localhost/api/documents", { method: "POST", body: form }));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/documents", () => {
  it("returns 401 for unauthenticated users", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost/api/documents?id=x", { method: "DELETE" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing id", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockCreateClient.mockReturnValue(adminSb());
    mockCreateAdminClient.mockReturnValue(adminSb());
    const res = await DELETE(new Request("http://localhost/api/documents", { method: "DELETE" }));
    expect(res.status).toBe(400);
  });
});
