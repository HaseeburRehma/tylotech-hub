import { redirect } from "next/navigation";
import { getAuthUser, isStaff } from "@/lib/auth";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  // Clients can never reach the internal command center.
  if (!isStaff(user)) redirect("/dashboard");
  return <>{children}</>;
}
