"use client";

import { AlertTriangle, LayoutDashboard, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";

/**
 * Error boundary inside the portal layout: a failing page keeps the sidebar and
 * navigation, so the user can retry or simply go somewhere else.
 */
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="card max-w-md space-y-4 p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-foreground">{t("error.title")}</h1>
          <p className="text-sm text-muted">{t("error.body")}</p>
          {error.digest && <p className="font-mono text-[11px] text-muted/60">Ref: {error.digest}</p>}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => reset()}>
            <RefreshCw className="h-4 w-4" /> {t("error.retry")}
          </Button>
          <Link href="/dashboard">
            <Button variant="outline">
              <LayoutDashboard className="h-4 w-4" /> {t("error.toDashboard")}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
