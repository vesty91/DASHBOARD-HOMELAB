"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("dashboard_global_error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#0b0f14",
          color: "#f5f7fa",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "2rem",
            boxSizing: "border-box",
          }}
        >
          <section style={{ maxWidth: "40rem", textAlign: "center" }}>
            <h1 style={{ marginBottom: "0.75rem" }}>Le Dashboard a rencontré une erreur</h1>
            <p style={{ color: "#aeb8c4", lineHeight: 1.6 }}>
              Réessayez immédiatement. Si le serveur vient d’être redéployé, un rechargement complet
              suffit généralement.
            </p>
            {error.digest ? (
              <p style={{ color: "#7f8a96", fontSize: "0.85rem" }}>Erreur {error.digest}</p>
            ) : null}
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                justifyContent: "center",
                flexWrap: "wrap",
                marginTop: "1.25rem",
              }}
            >
              <button
                type="button"
                onClick={reset}
                style={{
                  padding: "0.7rem 1rem",
                  borderRadius: "0.6rem",
                  border: "1px solid #324152",
                  background: "#1b2530",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Réessayer
              </button>
              <button
                type="button"
                onClick={() => window.location.assign("/apps")}
                style={{
                  padding: "0.7rem 1rem",
                  borderRadius: "0.6rem",
                  border: "1px solid #324152",
                  background: "#111821",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Retour aux Apps
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
