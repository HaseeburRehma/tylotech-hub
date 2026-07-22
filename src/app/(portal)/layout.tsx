import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { UserProvider } from "@/components/providers/user-provider";
import { getAuthUser, isStaff } from "@/lib/auth";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect("/login"); // backstop — middleware already guards these routes

  return (
    <UserProvider user={user}>
      <AppShell user={user} canSeeInternal={isStaff(user)}>
        {children}
      </AppShell>
    </UserProvider>
  );
}
