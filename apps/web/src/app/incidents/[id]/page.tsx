import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "@/lib/server/board-api";
import {
  INCIDENT_KIND_LABELS,
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_STATUS_LABELS,
  INCIDENT_STATUS_TONES,
  formatIncidentDuration,
  formatIncidentTime,
} from "../labels";

export const dynamic = "force-dynamic";

const EVENT_LABELS = {
  opened: "Ouverture",
  resolved: "Résolution",
  note: "Note",
} as const;

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caller = await getBoardCaller();
  const permissions = await caller.incident.permissions();
  if (!permissions.canRead) redirect("/forbidden");

  let timeline: Awaited<ReturnType<typeof caller.incident.timeline>> | null = null;
  try {
    timeline = await caller.incident.timeline({ id, limit: 100 });
  } catch {
    notFound();
  }
  if (!timeline) notFound();

  const { incident, events } = timeline;
  let integrationLabel = "Intégration masquée";
  if (incident.integrationId) {
    try {
      const dto = await caller.integration.get({ id: incident.integrationId });
      integrationLabel = dto.name;
    } catch {
      integrationLabel = "Intégration";
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={integrationLabel}
        description={`${INCIDENT_KIND_LABELS[incident.kind]} · ${INCIDENT_SEVERITY_LABELS[incident.severity]}`}
        actions={
          <Link className="ui-btn ui-btn-secondary" href="/incidents">
            Retour
          </Link>
        }
      />
      <dl className="incident-detail-meta">
        <div>
          <dt>Statut</dt>
          <dd>
            <Badge tone={INCIDENT_STATUS_TONES[incident.status]}>
              {INCIDENT_STATUS_LABELS[incident.status]}
            </Badge>
          </dd>
        </div>
        <div>
          <dt>Ouverture</dt>
          <dd>{formatIncidentTime(incident.openedAt)}</dd>
        </div>
        <div>
          <dt>Durée</dt>
          <dd>{formatIncidentDuration(incident.openedAt, incident.resolvedAt)}</dd>
        </div>
        <div>
          <dt>Résolution</dt>
          <dd>{formatIncidentTime(incident.resolvedAt)}</dd>
        </div>
      </dl>
      <section aria-labelledby="incident-timeline-title">
        <h2 id="incident-timeline-title" className="incident-section-title">
          Chronologie
        </h2>
        {events.length === 0 ? (
          <p>Aucun événement.</p>
        ) : (
          <ol className="incident-timeline" data-testid="incident-timeline">
            {events.map((event) => (
              <li key={event.id}>
                <div className="incident-timeline-item">
                  <Badge tone="neutral">{EVENT_LABELS[event.eventType]}</Badge>
                  <time dateTime={event.createdAt}>{formatIncidentTime(event.createdAt)}</time>
                  <p>{event.summary}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </PageContainer>
  );
}
