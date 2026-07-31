"use client";

import { motion } from "framer-motion";
import { BarChart3, Bot, MessagesSquare, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { useTheme } from "@/lib/theme/theme-provider";

const FEATURES = [
  { icon: BarChart3, title: "Live performance", desc: "Real-time KPIs across Meta, Google & SEO." },
  { icon: Bot, title: "AI marketing tools", desc: "On-brand content, ad copy & SEO in seconds." },
  { icon: MessagesSquare, title: "Your team, one click away", desc: "Chat, reports and updates in one place." },
];

function PreviewCard() {
  // A small, on-brand product peek — hints at the dashboard behind the login.
  const bars = [42, 58, 50, 71, 64, 83, 76];
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ delay: 0.25, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="glass w-full max-w-sm rounded-2xl border border-white/10 p-4 shadow-float"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-medium text-white/60">Monthly Ad Spend</span>
        <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-semibold text-brand">+12.4%</span>
      </div>
      <p className="font-display text-2xl font-semibold text-white">€18,400</p>
      <div className="mt-3 flex h-14 items-end gap-1.5">
        {bars.map((h, i) => (
          <motion.span
            key={i}
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ delay: 0.5 + i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 rounded-t-sm bg-brand/80"
          />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 border-t border-white/10 pt-3">
        <div><span className="text-[10px] text-white/50">Leads</span><p className="text-sm font-semibold text-white">342</p></div>
        <div><span className="text-[10px] text-white/50">ROAS</span><p className="text-sm font-semibold text-white">4.7x</p></div>
        <div className="ml-auto text-[10px] text-brand">● live</div>
      </div>
    </motion.div>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ---------- Left: branded showcase ---------- */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-10 xl:p-14 lg:flex">
        {/* layered brand background */}
        <div className="absolute inset-0 -z-10 bg-[rgb(var(--accent))]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(130%_120%_at_-5%_-5%,rgb(var(--brand)/0.45),transparent_52%)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(100%_100%_at_110%_110%,rgb(var(--brand)/0.22),transparent_55%)]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-black/10 to-black/40" />
        <div className="absolute inset-0 -z-10 bg-grid bg-[size:44px_44px] opacity-[0.18] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="absolute -left-24 top-1/4 -z-10 h-80 w-80 rounded-full bg-brand/30 blur-[110px]" />
        <div className="absolute bottom-0 right-0 -z-10 h-72 w-72 rounded-full bg-brand/15 blur-[120px]" />

        <Logo size={34} />

        <div className="max-w-md">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-white xl:text-[2.75rem]"
          >
            Your growth,
            <br />
            in one place.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/65"
          >
            {theme.tagline ?? "KPIs, AI tools, reports and a direct line to your team — beautifully in one dashboard."}
          </motion.p>

          <div className="mt-7 space-y-3.5">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.08, duration: 0.5 }}
                  className="flex items-start gap-3"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/20 text-brand ring-1 ring-brand/30">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{f.title}</p>
                    <p className="text-[13px] text-white/65">{f.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-7">
            <PreviewCard />
          </div>
        </div>

        <div className="flex items-center gap-2 text-[13px] text-white/50">
          <ShieldCheck className="h-4 w-4 text-brand/70" />
          Private, secure & GDPR-compliant · Powered by TyloTech
        </div>
      </div>

      {/* ---------- Right: form ---------- */}
      <div className="relative flex items-center justify-center bg-bg px-5 py-10 sm:px-10">
        <div className="pointer-events-none absolute inset-0 -z-10 lg:hidden">
          <div className="absolute left-1/2 top-0 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-brand/[0.12] blur-[120px]" />
        </div>
        <div className="absolute right-5 top-5">
          <ThemeSwitcher />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[400px]"
        >
          {/* Mobile brand mark */}
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo size={40} showName={false} />
          </div>
          {children}
          <div className="mt-8 flex items-center justify-center gap-1.5 text-xs text-muted/60">
            <Sparkles className="h-3 w-3 text-brand/60" />
            Powered by <span className="font-semibold text-muted">TyloTech</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
