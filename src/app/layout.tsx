import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { buildClientTheme, type BrandTheme } from "@/lib/theme/themes";
import { getAuthUser } from "@/lib/auth";
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

  return (
    <html lang="en" className={`${inter.variable} ${sora.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-foreground antialiased">
        <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
