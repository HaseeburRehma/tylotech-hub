import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { LOGIN_BRAND_COOKIE, loginPathFor } from "@/lib/login-brand";
import { AppShell, type SidebarClient } from "@/components/layout/app-shell";
import { UserProvider } from "@/components/providers/user-provider";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ActiveClientProvider } from "@/components/providers/active-client-provider";
import { MotionProvider } from "@/components/providers/motion-provider";
import { RefreshProvider } from "@/components/providers/refresh-provider";
import { SpeedToLeadProvider } from "@/components/leads/speed-to-lead-provider";
import { activeClientRef } from "@/lib/active-client-server";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect(loginPathFor(cookies().get(LOGIN_BRAND_COOKIE)?.value)); // backstop: middleware guards these routes

  // Staff get the client roster in the sidebar (to jump into each client's
  // workspace/chat). The list is confidential, so clients never receive it.
  // Lightweight counts for sidebar badges (staff only, best-effort), read
  // together with the roster.
  let clients: SidebarClient[] = [];
  let navBadges: Record<string, number> = {};
  if (isStaff(user)) {
    const admin = createAdminClient();
    const sb = createClient();
    const [roster, projects, processes] = await Promise.all([
      // Tolerate the pre-0021 window where `slug` doesn't exist yet.
      admin ? admin.from("clients").select("*").order("company") : null,
      sb ? sb.from("projects").select("*", { count: "exact", head: true }).neq("status", "done") : null,
      sb ? sb.from("workflow_runs").select("*", { count: "exact", head: true }).eq("status", "active") : null,
    ]);
    clients = (roster?.data ?? []).filter((c: any) => !c.archived_at).map((c: any) => ({ id: c.id, slug: c.slug ?? null, name: c.company ?? "Client", logoUrl: c.logo_url, color: c.primary_color ?? null }));
    if (sb) {
      navBadges = {
        "/internal/projects": projects?.count ?? 0,
        "/internal/processes": processes?.count ?? 0,
      };
    }
  }

  const ref = activeClientRef();
  const initialActiveId = (ref && clients.find((c) => c.id === ref || c.slug === ref)?.id) ?? clients[0]?.id ?? null;

  return (
    <UserProvider user={user}>
      <RefreshProvider>
        <ActiveClientProvider clients={clients} initialActiveId={initialActiveId}>
          <MotionProvider>
            <AppShell user={user} canSeeInternal={isStaff(user)} clients={clients} navBadges={navBadges}>
              {children}
            </AppShell>
          </MotionProvider>
          <SpeedToLeadProvider
            userId={user.id}
            role={user.role}
            clientId={user.client_id}
            tenantNames={isStaff(user) ? Object.fromEntries(clients.map((c) => [c.id, c.name])) : undefined}
          />
        </ActiveClientProvider>
      </RefreshProvider>
    </UserProvider>
  );
}
