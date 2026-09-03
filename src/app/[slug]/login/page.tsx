import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getClientBySlugPublic } from "@/lib/data";
import { buildClientTheme } from "@/lib/theme/themes";
import { ClientThemeApplier } from "@/components/auth/client-theme-applier";
import { AuthShell } from "@/components/auth/auth-shell";
import { ClientLoginForm } from "./form";

/**
 * Client-branded login page: /<slug>/login
 * Auto-applies the client's brand theme (colors, logo) on the login page.
 */
export default async function ClientLoginPage({ params }: { params: { slug: string } }) {
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
