import type { Metadata } from "next";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: "Konto löschen · TyloHQ",
  description: "So löschst du dein TyloHQ-Konto und welche Daten dabei entfernt werden.",
};

// Public page (linked from the Google Play data safety form): how to delete a
// TyloHQ account, in the app or by email. Static, no sign-in needed.
const SUPPORT = "info@tylotech.de";

export default function DeleteAccountPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <Logo />

      <h1 className="mt-10 font-display text-3xl font-semibold tracking-tight">TyloHQ-Konto löschen</h1>
      <p className="mt-3 text-sm text-muted">TyloHQ ist das Kundenportal von TyloTech. So kannst du dein Konto und die zugehörigen Daten löschen.</p>

      <section className="mt-8 space-y-3 text-sm leading-6">
        <h2 className="font-display text-lg font-semibold">In der App (sofort)</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>TyloHQ öffnen und anmelden.</li>
          <li>Unten auf <strong>Mehr</strong> tippen, dann <strong>Einstellungen</strong>.</li>
          <li><strong>Konto löschen</strong> wählen und bestätigen.</li>
        </ol>
        <p>Dein Login wird sofort gelöscht und du wirst abgemeldet.</p>

        <h2 className="pt-4 font-display text-lg font-semibold">Per E-Mail</h2>
        <p>
          Schreib von der E-Mail-Adresse deines Kontos an{" "}
          <a className="font-medium text-brand-ink underline" href={`mailto:${SUPPORT}?subject=TyloHQ%20Konto%20l%C3%B6schen`}>
            {SUPPORT}
          </a>{" "}
          mit dem Betreff „TyloHQ Konto löschen“. Wir löschen das Konto innerhalb von 30 Tagen und bestätigen es dir per E-Mail.
        </p>

        <h2 className="pt-4 font-display text-lg font-semibold">Was gelöscht wird</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Dein Login (E-Mail-Adresse, Name, Profilbild) und deine Einstellungen</li>
          <li>Die Push-Registrierung deiner Geräte</li>
        </ul>
        <p>
          Nachrichten, Dateien und Berichte, die zum Projekt deines Unternehmens gehören, bleiben für dein Team erhalten,
          solange der Vertrag mit TyloTech läuft, und werden danach im Rahmen der gesetzlichen Aufbewahrungsfristen gelöscht.
          Rechnungen bewahren wir 10 Jahre auf (§ 147 AO).
        </p>
      </section>

      <section lang="en" className="mt-12 space-y-3 border-t border-line pt-8 text-sm leading-6 text-muted">
        <h2 className="font-display text-lg font-semibold text-foreground">Delete your TyloHQ account</h2>
        <p>
          In the app: <strong>More → Settings → Delete account</strong>. Your login is deleted immediately. Or email{" "}
          <a className="underline" href={`mailto:${SUPPORT}`}>{SUPPORT}</a> from your account&apos;s address and we delete it within 30 days.
          Your login, profile, settings and device push registrations are deleted; your company&apos;s shared project
          messages, files and reports stay with your team until the contract ends, and invoices are kept for 10 years as
          required by German law.
        </p>
      </section>
    </main>
  );
}
