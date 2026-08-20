import Link from "next/link";

/**
 * Branded 404 inside the portal shell (bilingual — rendered outside the i18n
 * provider on some paths, so both languages are shown statically).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="card max-w-md space-y-4 p-8">
        <p className="text-4xl font-semibold text-brand">404</p>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-foreground">Seite nicht gefunden</h1>
          <p className="text-sm text-muted">
            Diese Seite existiert nicht oder wurde verschoben.
          </p>
          <p className="text-xs text-muted/70">This page doesn&apos;t exist or was moved.</p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
        >
          Zum Dashboard · Back to dashboard
        </Link>
      </div>
    </div>
  );
}
