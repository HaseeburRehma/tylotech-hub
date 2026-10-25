import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Instrument_Serif, Inter } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { buildClientTheme, themeToCssVars, TYLOTECH_GOLD, TYLOTECH_THEME, type BrandTheme } from "@/lib/theme/themes";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { I18nProvider } from "@/lib/i18n/provider";
import { serverLocale } from "@/lib/i18n/server";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Headings, numbers and button labels (Figma uses Instrument Sans).
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-display", display: "swap" });
// Italic accent word in hero headings ("What *shall we start* with?").
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  // Absolute URLs for link previews (og:image etc.) — the live domain.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://www.tylohq.de"),
  title: "TyloTech Hub",
  description:
    "White-label client portal & internal command center — KPIs, AI tools, chat and reporting.",
  openGraph: {
    type: "website",
    siteName: "TyloHQ",
    title: "TyloTech Hub",
    description: "White-label client portal & internal command center — KPIs, leads, AI tools, chat and reporting.",
    url: "/",
    locale: "de_DE",
  },
  twitter: { card: "summary_large_image", title: "TyloTech Hub", description: "White-label client portal & internal command center — KPIs, leads, AI tools, chat and reporting." },
  // The app has its own DE/EN switch; browser machine translation rewrites the
  // DOM under React and crashes pages, so ask browsers not to offer it.
  other: { google: "notranslate" },
};

export const viewport: Viewport = {
  themeColor: "#08080a",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();

  // The choice persists in a cookie. Without one, follow the browser: German
  // browsers get German (the default), others English — so nobody needs the
  // browser's translator (which breaks the app).
  const locale = serverLocale();

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
        .select("*")
        .order("company");
      const seen = new Set([TYLOTECH_THEME.company.toLowerCase()]);
      brands = [TYLOTECH_THEME];
      for (const c of (data ?? []).filter((x: any) => !x.archived_at)) {
        const key = (c.company ?? "").toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        brands.push(
          buildClientTheme({
            id: c.id,
            company: c.company,
            primary: c.primary_color ?? TYLOTECH_GOLD,
            secondary: c.secondary_color ?? "#0A0A0A",
            logoUrl: c.logo_url,
          }),
        );
      }
    }
  }

  return (
    <html
      lang={locale}
      translate="no"
      className={`notranslate ${inter.variable} ${instrument.variable} ${instrumentSerif.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
      // Brand colours in the first paint — no flash of TyloTech gold before a client's brand loads.
      style={themeToCssVars(initialTheme ?? TYLOTECH_THEME) as React.CSSProperties}
    >
      <head>
        {/* If a translator or extension still rewrites text nodes, React's later
            removeChild/insertBefore would throw and crash the page — tolerate it
            (https://github.com/facebook/react/issues/11538). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(typeof Node!=="function"||!Node.prototype)return;var r=Node.prototype.removeChild;Node.prototype.removeChild=function(c){if(c.parentNode!==this){return c}return r.apply(this,arguments)};var i=Node.prototype.insertBefore;Node.prototype.insertBefore=function(n,ref){if(ref&&ref.parentNode!==this){return i.call(this,n,null)}return i.apply(this,arguments)}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("theme-mode")==="dark"){document.documentElement.classList.add("dark")}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-bg text-foreground antialiased">
        <I18nProvider initialLocale={locale}>
          <ThemeProvider initialTheme={initialTheme} brands={brands}>{children}</ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
