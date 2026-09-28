import { getAuthUser } from "@/lib/auth";
import { SettingsView } from "./view";

export default async function SettingsPage() {
  const user = await getAuthUser();
  return (
    <SettingsView
      name={user?.name ?? ""}
      email={user?.email ?? ""}
      role={user?.role === "admin" ? "Super Admin" : user?.role === "team" ? "Team" : "Client"}
    />
  );
}
