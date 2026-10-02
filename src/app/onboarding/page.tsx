import { redirect } from "next/navigation";
import { getAuthUser, isStaff } from "@/lib/auth";
import { PROVIDERS, isProviderLive } from "@/lib/integrations/providers";
import { createAdminClient } from "@/lib/supabase/admin";
import { OnboardingView } from "./view";

export default async function OnboardingPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const staff = isStaff(user);
  let connectedProviders: string[] = [];
  const admin = createAdminClient();
  if (admin && user.client_id && !staff) {
    const { data } = await admin
      .from("integrations")
      .select("provider,status")
      .eq("client_id", user.client_id);
    connectedProviders = (data ?? []).filter((r) => r.status === "connected").map((r) => r.provider);
  }

  return (
    <OnboardingView
      firstName={user.name.split(" ")[0] || user.name}
      fullName={user.name}
      title={user.title ?? ""}
      avatarUrl={user.avatarUrl}
      workspace={staff ? "TyloTech" : user.company ?? "TyloTech"}
      isStaff={staff}
      connectedProviders={connectedProviders}
      liveProviders={PROVIDERS.filter(isProviderLive).map((p) => p.id)}
    />
  );
}
