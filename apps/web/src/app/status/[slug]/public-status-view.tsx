"use client";

import { useEffect, useState } from "react";
import { Badge } from "@dashboard/ui";
import type { PublicStatusPageDto } from "@dashboard/status-pages";
import { fetchPublicStatusPageAction } from "@/app/status-pages/actions";
import {
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_STATUS_TONES,
  PUBLIC_STATUS_LABELS,
  PUBLIC_STATUS_TONES,
  formatStatusTime,
} from "@/app/status-pages/labels";

/** Bounded public polling aligned with server public cache TTL (15s). */
const POLL_MS = 15_000;

export function PublicStatusView({ initial }: { initial: PublicStatusPageDto }) {
  const [page, setPage] = useState(initial);
  const [offline, setOffline] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    setPage(initial);
  }, [initial]);

  useEffect(() => {
    function onOnline() {
      setOffline(false);
    }
    function onOffline() {
      setOffline(true);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setOffline(!navigator.onLine);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (!navigator.onLine) {
        setOffline(true);
        return;
      }
      const result = await fetchPublicStatusPageAction(page.slug);
      if (cancelled) return;
      if (!result.ok) {
        setPollError(result.message);
        return;
      }
      setPollError(null);
      setPage(result.page);
    };
    const id = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [page.slug]);

  const recentIncidents = page.services.filter(
    (service) =>
      service.showIncidentHistory && (service.status === "outage" || service.status === "degraded"),
  );

  return (
    <div className="public-status" data-testid="public-status-page">
      <header className="public-status-header">
        <p className="public-status-brand">Homelab</p>
        <h1>{page.name}</h1>
        {page.description ? <p className="ui-muted">{page.description}</p> : null}
        <div className="public-status-overall" aria-live="polite">
          <span className="public-status-overall-label">Statut global</span>
          <Badge tone={PUBLIC_STATUS_TONES[page.overallStatus]}>
            {PUBLIC_STATUS_LABELS[page.overallStatus]}
          </Badge>
        </div>
        <p className="public-status-updated">
          Dernière mise à jour :{" "}
          <time dateTime={page.updatedAt}>{formatStatusTime(page.updatedAt)}</time>
        </p>
        {offline ? (
          <p className="public-status-offline" role="status" data-testid="public-status-offline">
            Statut indisponible hors ligne. Aucune donnée live n’est mise en cache comme état
            courant.
          </p>
        ) : null}
        {pollError ? (
          <p className="ui-muted" role="status">
            Actualisation différée : {pollError}
          </p>
        ) : null}
      </header>

      <section aria-labelledby="public-status-services">
        <h2 id="public-status-services">Services</h2>
        {page.services.length === 0 ? (
          <p className="ui-muted">Aucun service publié.</p>
        ) : (
          <ul className="public-status-service-list">
            {page.services.map((service) => (
              <li key={service.id} data-testid={`public-status-service-${service.id}`}>
                <div>
                  <strong>{service.displayName}</strong>
                  {service.description ? <p className="ui-muted">{service.description}</p> : null}
                </div>
                <Badge tone={PUBLIC_STATUS_TONES[service.status]}>
                  {PUBLIC_STATUS_LABELS[service.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="public-status-maintenances">
        <h2 id="public-status-maintenances">Maintenances</h2>
        {page.maintenances.length === 0 ? (
          <p className="ui-muted">Aucune maintenance planifiée ou active.</p>
        ) : (
          <ul className="public-status-maintenance-list">
            {page.maintenances.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  {item.description ? <p className="ui-muted">{item.description}</p> : null}
                  <p className="ui-muted">
                    {formatStatusTime(item.startsAt)} → {formatStatusTime(item.endsAt)}
                  </p>
                </div>
                <Badge tone={MAINTENANCE_STATUS_TONES[item.status]}>
                  {MAINTENANCE_STATUS_LABELS[item.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="public-status-incidents">
        <h2 id="public-status-incidents">Incidents récents</h2>
        {recentIncidents.length === 0 ? (
          <p className="ui-muted">Aucun incident public récent.</p>
        ) : (
          <ul className="public-status-incident-list">
            {recentIncidents.map((service) => (
              <li key={service.id}>
                <strong>{service.displayName}</strong>
                <Badge tone={PUBLIC_STATUS_TONES[service.status]}>
                  {PUBLIC_STATUS_LABELS[service.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
