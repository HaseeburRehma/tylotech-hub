import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { LOGIN_BRAND_COOKIE, loginPathFor } from "@/lib/login-brand";
import { AppShell, type SidebarClient } from "@/components/layout/app-shell";
import { UserProvider } from "@/components/providers/user-provider";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ActiveClientProvider } from "@/components/providers/active-client-provider";
import { activeClientRef } from "@/lib/active-client-server";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect(loginPathFor(cookies().get(LOGIN_BRAND_COOKIE)?.value)); // backstop — middleware guards these routes

  // Staff get the client roster in the sidebar (to jump into each client's
  // workspace/chat). The list is confidential, so clients never receive it.
  let clients: SidebarClient[] = [];
  if (isStaff(user)) {
    const admin = createAdminClient();
    if (admin) {
      // Tolerate the pre-0021 window where `slug` doesn't exist yet.
      const res = await admin.from("clients").select("*").order("company");
      clients = (res.data ?? []).filter((c: any) => !c.archived_at).map((c: any) => ({ id: c.id, slug: c.slug ?? null, name: c.company ?? "Client", logoUrl: c.logo_url, color: c.primary_color ?? null }));
    }
  }

  const ref = activeClientRef();
  const initialActiveId = (ref && clients.find((c) => c.id === ref || c.slug === ref)?.id) ?? clients[0]?.id ?? null;

  return (
    <UserProvider user={user}>
      <ActiveClientProvider clients={clients} initialActiveId={initialActiveId}>
        <AppShell user={user} canSeeInternal={isStaff(user)} clients={clients}>
          {children}
        </AppShell>
      </ActiveClientProvider>
    </UserProvider>
  );
}
