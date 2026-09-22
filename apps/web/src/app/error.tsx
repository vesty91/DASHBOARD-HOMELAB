"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "70vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <section style={{ maxWidth: "38rem", textAlign: "center" }}>
        <h1>Une erreur est survenue</h1>
        <p className="ui-muted">
          Le Dashboard reste accessible. Réessayez ou revenez directement aux applications.
        </p>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: "1rem",
          }}
        >
          <button className="ui-btn ui-btn-primary" type="button" onClick={reset}>
            Réessayer
          </button>
          <a className="ui-btn" href="/apps">
            Retour aux Apps
          </a>
        </div>
      </section>
    </main>
  );
}
