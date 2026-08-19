"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary. Catches render/data errors in any page or client
 * component so a transient failure shows a branded retry card instead of a bare
 * white "Application error" screen. Bilingual (DE first) — it renders outside the
 * i18n provider, so both languages are shown statically.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface to the browser console / Vercel logs for diagnosis.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="card max-w-md space-y-4 p-8">
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-foreground">Etwas ist schiefgelaufen</h1>
          <p className="text-sm text-muted">
            Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.
          </p>
          <p className="text-xs text-muted/70">Something went wrong — please try again.</p>
        </div>
        <button
          onClick={() => reset()}
          className="inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
        >
          Erneut versuchen · Try again
        </button>
      </div>
    </div>
  );
}
