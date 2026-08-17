import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { buildClientTheme, TYLOTECH_THEME, type BrandTheme } from "@/lib/theme/themes";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { I18nProvider } from "@/lib/i18n/provider";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/i18n/dictionary";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "TyloTech Hub",
  description:
    "White-label client portal & internal command center — KPIs, AI tools, chat and reporting.",
};

export const viewport: Viewport = {
  themeColor: "#08080a",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();

  // German is the default language; the choice persists in a cookie.
  const cookieLocale = cookies().get(LOCALE_COOKIE)?.value as Locale | undefined;
  const locale: Locale = cookieLocale && LOCALES.includes(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  // A signed-in client re-skins the whole UI to their brand; staff keep TyloTech gold.
  let initialTheme: BrandTheme | undefined;
  if (user?.role === "client" && user.client_id && user.primaryColor) {
    initialTheme = buildClientTheme({
      id: user.client_id,
      company: user.company ?? "Client",
      primary: user.primaryColor,
      secondary: user.secondaryColor ?? "#0A0A0A",
      logoUrl: user.logoUrl,
    });
  }

  // The full client roster is confidential — only STAFF get every brand in the
  // white-label switcher. The public login (and clients) fall back to the small
  // built-in showcase (undefined → ThemeProvider uses THEMES). Clients also have
  // the switcher hidden entirely in the top bar.
  let brands: BrandTheme[] | undefined;
  if (isStaff(user)) {
    const admin = createAdminClient();
    if (admin) {
      const { data } = await admin
        .from("clients")
        .select("id,company,primary_color,secondary_color,logo_url")
        .order("company");
      const seen = new Set([TYLOTECH_THEME.company.toLowerCase()]);
      brands = [TYLOTECH_THEME];
      for (const c of data ?? []) {
        const key = (c.company ?? "").toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        brands.push(
          buildClientTheme({
            id: c.id,
            company: c.company,
            primary: c.primary_color ?? "#C9A84C",
            secondary: c.secondary_color ?? "#0A0A0A",
            logoUrl: c.logo_url,
          }),
        );
      }
    }
  }

  return (
    <html lang={locale} className={`${inter.variable} ${sora.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-foreground antialiased">
        <I18nProvider initialLocale={locale}>
          <ThemeProvider initialTheme={initialTheme} brands={brands}>{children}</ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
