/**
 * Small brand marks for the data sources (Figma "Integrationen" uses the real
 * logos, not generic icons). Inline SVG so they render without network requests.
 */
export function ProviderLogo({ id, className = "h-5 w-5" }: { id: string; className?: string }) {
  switch (id) {
    case "search_console":
      return <GoogleG className={className} />;
    case "meta_ads":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            fill="none"
            stroke="#0081FB"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.6 12c0-3.1 1.6-5.2 3.7-5.2 3.7 0 7.3 10.4 11.4 10.4 2 0 3.7-2 3.7-5.2s-1.7-5.2-3.7-5.2c-4.1 0-7.7 10.4-11.4 10.4-2.1 0-3.7-2.1-3.7-5.2Z"
          />
        </svg>
      );
    case "google_ads":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path fill="#FBBC04" d="M3.4 16.5 9.7 5.6a3 3 0 0 1 5.2 3L8.6 19.5a3 3 0 1 1-5.2-3Z" />
          <path fill="#4285F4" d="M20.6 16.5 14.3 5.6a3 3 0 1 0-5.2 3l6.3 10.9a3 3 0 1 0 5.2-3Z" />
          <circle cx="6" cy="18" r="3" fill="#34A853" />
        </svg>
      );
    case "ga4":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="15.5" y="2.5" width="5" height="19" rx="2.5" fill="#F9AB00" />
          <rect x="9.5" y="9" width="5" height="12.5" rx="2.5" fill="#E37400" />
          <circle cx="6" cy="19" r="2.5" fill="#E37400" />
        </svg>
      );
    default:
      return null;
  }
}

function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9Z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7Z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44Z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9Z" />
    </svg>
  );
}
