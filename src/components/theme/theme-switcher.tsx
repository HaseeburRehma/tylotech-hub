"use client";

import { Check, Palette } from "lucide-react";
import { Menu } from "@/components/ui/menu";
import { useT } from "@/lib/i18n/provider";
import { useTheme } from "@/lib/theme/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeSwitcher() {
  const t = useT();
  const { theme, themes, setThemeById } = useTheme();

  return (
    <Menu
      width={288}
      align="end"
      header={
        <div className="px-1.5 py-1">
          <p className="text-xs font-semibold text-foreground">{t("theme.title")}</p>
          <p className="text-xs text-muted">{t("theme.hint")}</p>
        </div>
      }
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          title={t("theme.switch")}
          className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 text-sm text-muted transition-colors hover:border-brand/40 hover:text-foreground ring-focus"
        >
          <Palette className="h-4 w-4 text-brand-ink" />
          <span className="hidden sm:inline">{t("theme.button")}</span>
          <span className="h-3.5 w-3.5 rounded-full ring-2 ring-bg" style={{ background: `rgb(${theme.primary.join(" ")})` }} />
        </button>
      )}
    >
      {(close) =>
        themes.map((th) => {
          const active = th.id === theme.id;
          return (
            <button
              key={th.id}
              type="button"
              role="menuitem"
              data-selected={active ? "true" : undefined}
              onClick={() => {
                setThemeById(th.id);
                close();
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors focus-visible:bg-surface-2",
                active ? "bg-brand/10" : "hover:bg-surface-2",
              )}
            >
              {th.logo.type === "url" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={th.logo.value} alt="" className="h-7 w-7 rounded-lg bg-surface-2 object-contain p-0.5 ring-1 ring-border" />
              ) : (
                <span className="h-7 w-7 rounded-lg ring-1 ring-border" style={{ background: `rgb(${th.primary.join(" ")})` }} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{th.company}</span>
                <span className="block truncate text-xs text-muted">{th.tagline}</span>
              </span>
              {active && <Check className="h-4 w-4 shrink-0 text-brand-ink" />}
            </button>
          );
        })
      }
    </Menu>
  );
}
