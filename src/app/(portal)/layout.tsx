import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { UserProvider } from "@/components/providers/user-provider";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect("/login"); // backstop — middleware already guards these routes

  // Staff get the client roster in the sidebar (to jump into each client's
  // workspace/chat). The list is confidential, so clients never receive it.
  let clients: { id: string; name: string; logoUrl: string | null }[] = [];
  if (isStaff(user)) {
    const admin = createAdminClient();
    if (admin) {
      const { data } = await admin.from("clients").select("id,company,logo_url").order("company");
      clients = (data ?? []).map((c) => ({ id: c.id, name: c.company ?? "Client", logoUrl: c.logo_url }));
    }
  }

  return (
    <UserProvider user={user}>
      <AppShell user={user} canSeeInternal={isStaff(user)} clients={clients}>
        {children}
      </AppShell>
    </UserProvider>
  );
}
