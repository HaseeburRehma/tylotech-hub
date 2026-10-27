import { describe, expect, it, vi, beforeEach } from "vitest";

const mockUser = vi.fn();
const mockTeam = vi.fn();
const mockClientUsers = vi.fn();
vi.mock("@/lib/auth", () => ({ getAuthUser: () => mockUser(), isStaff: (u: any) => !!u && u.role !== "client" }));
vi.mock("@/lib/data", () => ({ listTeamPeers: () => mockTeam(), listClientUsers: (id: string | null) => mockClientUsers(id) }));

import { GET } from "./route";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const get = (qs = "") => GET(new Request(`http://x/api/chat/people${qs}`));

beforeEach(() => {
  vi.clearAllMocks();
  mockTeam.mockResolvedValue([{ id: "s1", name: "Anna Team", role: "team", title: "Team", avatarUrl: "https://x/a.png" }]);
  mockClientUsers.mockResolvedValue([{ id: "c1", name: "Lena Kunde", role: "client", title: "Client", avatarUrl: null }]);
});

describe("GET /api/chat/people", () => {
  it("requires sign-in", async () => {
    mockUser.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("gives a client the team and only their own company, whatever ?clientId says", async () => {
    mockUser.mockResolvedValue({ id: "c1", role: "client", client_id: C1 });
    const res = await get(`?clientId=${C2}`);
    expect(mockClientUsers).toHaveBeenCalledWith(C1);
    const body = await res.json();
    expect(body.people).toEqual([
      { id: "s1", name: "Anna Team", avatarUrl: "https://x/a.png" },
      { id: "c1", name: "Lena Kunde", avatarUrl: null },
    ]);
  });

  it("lets staff ask for a client and ignores malformed ids", async () => {
    mockUser.mockResolvedValue({ id: "s1", role: "admin", client_id: null });
    await get(`?clientId=${C2}`);
    expect(mockClientUsers).toHaveBeenLastCalledWith(C2);
    await get("?clientId=../users");
    expect(mockClientUsers).toHaveBeenLastCalledWith(null);
  });

  it("exposes only id, name and photo", async () => {
    mockUser.mockResolvedValue({ id: "c1", role: "client", client_id: C1 });
    const body = await (await get()).json();
    for (const p of body.people) expect(Object.keys(p).sort()).toEqual(["avatarUrl", "id", "name"]);
  });
});
