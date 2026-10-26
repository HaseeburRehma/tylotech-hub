import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getAuthUser } from "@/lib/auth";
import { getClientBySlugPublic } from "@/lib/data";
import { safeRedirect } from "@/lib/safe-redirect";
import { buildClientTheme } from "@/lib/theme/themes";
import { ClientThemeApplier } from "@/components/auth/client-theme-applier";
import { AuthShell } from "@/components/auth/auth-shell";
import { ClientLoginForm } from "./form";

export const dynamic = "force-dynamic";

/**
 * Client-branded login page: /<slug>/login
 * Auto-applies the client's brand theme (colors, logo) on the login page.
 */
export default async function ClientLoginPage({ params, searchParams }: { params: { slug: string }; searchParams: { redirect?: string } }) {
  // Already signed in (and authorized) → into the app, same as /login.
  const user = await getAuthUser().catch(() => null);
  if (user) redirect(safeRedirect(searchParams?.redirect));

  const client = await getClientBySlugPublic(params.slug);
  if (!client) notFound();

  const theme = buildClientTheme({
    id: client.id,
    company: client.company,
    primary: client.primary_color,
    secondary: client.secondary_color,
    logoUrl: client.logo_url,
  });

  return (
    <>
      <ClientThemeApplier theme={theme} />
      <AuthShell
        hideThemeSwitcher
        brand={{
          company: client.company,
          logoUrl: client.logo_url,
          tagline: theme.tagline,
        }}
      >
        <Suspense>
          <ClientLoginForm slug={params.slug} />
        </Suspense>
      </AuthShell>
    </>
  );
}
