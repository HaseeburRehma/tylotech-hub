"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown in the ROOT layout itself (e.g. a
 * transient Supabase reject in getAuthUser). It replaces the whole document, so
 * it ships its own <html>/<body> and inline styles — global CSS is not available
 * here. Dark surface + gold accent match the brand defaults.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0d0c0a",
          color: "#f5f3ee",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: "420px",
            textAlign: "center",
            background: "#181612",
            border: "1px solid rgba(201,168,76,0.25)",
            borderRadius: "16px",
            padding: "32px",
          }}
        >
          <h1 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 8px" }}>Etwas ist schiefgelaufen</h1>
          <p style={{ fontSize: "14px", color: "#b8b3a8", margin: "0 0 4px" }}>
            Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.
          </p>
          <p style={{ fontSize: "12px", color: "#8a857a", margin: "0 0 20px" }}>
            Something went wrong — please try again.
          </p>
          <button
            onClick={() => reset()}
            style={{
              height: "40px",
              padding: "0 18px",
              borderRadius: "12px",
              border: "none",
              background: "#c9a84c",
              color: "#181612",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Erneut versuchen · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
