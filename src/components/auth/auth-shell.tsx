"use client";

import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useTheme } from "@/lib/theme/theme-provider";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

function BrandMark({ size = 34, showName = true, logoUrl, company, dark }: { size?: number; showName?: boolean; logoUrl?: string | null; company?: string; dark?: boolean }) {
  if (logoUrl) {
    return (
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={company ?? ""} width={size} height={size} className="rounded-lg" />
        {showName && company && (
          <span className={cn("text-[15px] font-semibold tracking-tight", dark ? "text-white" : "text-foreground")}>{company}</span>
        )}
      </div>
    );
  }
  return <Logo size={size} showName={showName} invert={dark} />;
}

export interface AuthShellBrand {
  company: string;
  logoUrl?: string | null;
  tagline?: string;
}

function StyledHeadline({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") ? (
          <span key={i} className="italic" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
            {p.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function AuthShell({
  children,
  hideThemeSwitcher,
  brand,
  panelHeadline,
  panelTagline,
}: {
  children: React.ReactNode;
  hideThemeSwitcher?: boolean;
  brand?: AuthShellBrand;
  panelHeadline?: string;
  panelTagline?: string;
}) {
  const { theme } = useTheme();
  const t = useT();
  const headline = panelHeadline ?? t("auth.headline");
  const headlineFormatted = headline.replace("\n", " ");

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      {/* ---------- Left: form ---------- */}
      <div className="relative flex flex-col bg-bg px-5 py-8 sm:px-10 lg:px-14">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <BrandMark size={34} logoUrl={brand?.logoUrl} company={brand?.company} />
          <LanguageSwitcher />
        </div>

        {/* Centered form */}
        <div className="flex flex-1 items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[440px]"
          >
            {children}
          </motion.div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted/60">
          {/* Legal pages live on the company site (tylohq.de has no /impressum route). */}
          <a href="https://www.tylotech.de/impressum" target="_blank" rel="noopener noreferrer" className="hover:text-muted transition-colors">
            {t("auth.imprint")}
          </a>
          <a href="https://www.tylotech.de/datenschutz" target="_blank" rel="noopener noreferrer" className="hover:text-muted transition-colors">
            {t("auth.privacy")}
          </a>
          <span className="lg:ml-auto">{t("auth.copyright")}</span>
        </div>
      </div>

      {/* ---------- Right: branded showcase ---------- */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-10 xl:p-14 lg:flex">
        {/* layered brand background */}
        <div className="absolute inset-0 -z-10 bg-[rgb(var(--accent))]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(130%_120%_at_-5%_-5%,rgb(var(--brand)/0.45),transparent_52%)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(100%_100%_at_110%_110%,rgb(var(--brand)/0.22),transparent_55%)]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-black/10 to-black/40" />
        <div className="absolute inset-0 -z-10 bg-grid bg-[size:44px_44px] opacity-[0.18] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="absolute -right-24 top-1/4 -z-10 h-80 w-80 rounded-full bg-brand/30 blur-[110px]" />
        <div className="absolute bottom-0 left-0 -z-10 h-72 w-72 rounded-full bg-brand/15 blur-[120px]" />

        <BrandMark size={34} logoUrl={brand?.logoUrl} company={brand?.company} dark />

        <div className="max-w-lg">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-white xl:text-[2.75rem]"
          >
            <StyledHeadline text={headlineFormatted} />
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="mt-5 max-w-md text-[15px] leading-relaxed text-white/65"
          >
            {panelTagline ?? brand?.tagline ?? t("auth.tagline")}
          </motion.p>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="mt-8 flex gap-8"
          >
            <div>
              <p className="text-2xl font-bold text-white">2.109&nbsp;€</p>
              <p className="mt-1 text-sm text-white/50">{t("auth.statBudget")}</p>
            </div>
            <div className="border-l border-white/10 pl-8">
              <p className="text-2xl font-bold text-white">39</p>
              <p className="mt-1 text-sm text-white/50">{t("auth.statLeads")}</p>
            </div>
            <div className="border-l border-white/10 pl-8">
              <p className="text-2xl font-bold text-white">10</p>
              <p className="mt-1 text-sm text-white/50">{t("auth.statClients")}</p>
            </div>
          </motion.div>
        </div>

        {/* Bottom row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px] text-white/50">
            <ShieldCheck className="h-4 w-4 text-brand/70" />
            {t("auth.secure")}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white" />
            <span className="h-2 w-2 rounded-full bg-white/30" />
            <span className="h-2 w-2 rounded-full bg-white/30" />
          </div>
        </div>
      </div>
    </div>
  );
}
