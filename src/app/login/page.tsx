import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { safeRedirect } from "@/lib/safe-redirect";
import { LoginView } from "./login-form";

export const dynamic = "force-dynamic";

/**
 * Already signed in → go straight to the app instead of showing the login form.
 * getAuthUser() returns null for no-access sessions (archived client, deactivated,
 * MFA not completed), so this never loops with the portal layout's gate, and a
 * transient Supabase outage falls through to the form rather than erroring.
 */
export default async function LoginPage({ searchParams }: { searchParams: { redirect?: string } }) {
  const user = await getAuthUser().catch(() => null);
  if (user) redirect(safeRedirect(searchParams?.redirect));
  return <LoginView />;
}
