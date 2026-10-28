import { vi } from "vitest";
import type { AuthUser } from "@/lib/auth";

export const STAFF_USER: AuthUser = {
  id: "staff-1",
  email: "staff@tylotech.de",
  name: "Test Staff",
  role: "team",
  client_id: null,
  company: null,
  primaryColor: null,
  secondaryColor: null,
  logoUrl: null,
  title: "Developer",
  avatarUrl: null,
  notifyEmail: false,
  leadEmail: false,
};

export const ADMIN_USER: AuthUser = {
  id: "admin-1",
  email: "admin@tylotech.de",
  name: "Test Admin",
  role: "admin",
  client_id: null,
  company: null,
  primaryColor: null,
  secondaryColor: null,
  logoUrl: null,
  title: "Founder / Strategy",
  avatarUrl: null,
  notifyEmail: false,
  leadEmail: false,
};

export const CLIENT_USER: AuthUser = {
  id: "client-1",
  email: "client@example.com",
  name: "Test Client",
  role: "client",
  client_id: "tenant-a",
  company: "Test GmbH",
  primaryColor: "#002E3D",
  secondaryColor: "#D1AA71",
  logoUrl: null,
  title: null,
  avatarUrl: null,
  notifyEmail: true,
  leadEmail: true,
};

export const OTHER_CLIENT_USER: AuthUser = {
  id: "client-2",
  email: "other@example.com",
  name: "Other Client",
  role: "client",
  client_id: "tenant-b",
  company: "Other GmbH",
  primaryColor: "#111",
  secondaryColor: "#222",
  logoUrl: null,
  title: null,
  avatarUrl: null,
  notifyEmail: true,
  leadEmail: true,
};

export function mockAuth(user: AuthUser | null) {
  return vi.fn(async () => user);
}

export function jsonReq(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function mockSupabaseClient(overrides: Record<string, unknown> = {}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: undefined as unknown,
    data: null,
    error: null,
    ...overrides,
  };
  return {
    from: vi.fn(() => chain),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    _chain: chain,
  };
}
