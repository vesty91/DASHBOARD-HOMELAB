"use client";

import type { PublicAuthSession } from "@dashboard/auth";
import { Badge, Button } from "@dashboard/ui";
import { revokeOtherSessionsAction, revokeOwnSessionAction } from "./session-actions";

export function SessionsPanel({ sessions }: { sessions: PublicAuthSession[] }) {
  return (
    <section className="ui-card ui-form-card">
      <h2 className="ui-section-title">Sessions actives</h2>
      <p className="ui-muted">
        Révoquez les sessions inconnues. La session actuelle reste utilisable jusqu'à la
        déconnexion.
      </p>
      {sessions.length > 1 ? (
        <form action={revokeOtherSessionsAction} style={{ margin: "0.75rem 0" }}>
          <Button type="submit" variant="secondary">
            Révoquer les autres sessions
          </Button>
        </form>
      ) : null}
      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Créée</th>
              <th>Dernière activité</th>
              <th>Navigateur</th>
              <th>État</th>
              <th className="ui-table-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td>{session.createdAt}</td>
                <td>{session.lastSeenAt}</td>
                <td>{session.userAgent ?? "—"}</td>
                <td>
                  {session.current ? (
                    <Badge tone="success">Session actuelle</Badge>
                  ) : (
                    <Badge tone="warning">Autre appareil</Badge>
                  )}
                </td>
                <td className="ui-table-actions">
                  {session.current ? null : (
                    <form action={revokeOwnSessionAction.bind(null, session.id)}>
                      <button type="submit" className="ui-btn-ghost">
                        Révoquer
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
