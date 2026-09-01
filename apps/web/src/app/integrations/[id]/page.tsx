import Link from "next/link";
import { redirect } from "next/navigation";
import type { DockerIntegrationMetadata } from "@dashboard/docker";
import type { IntegrationDto } from "@dashboard/integrations";
import type {
  SynologyIntegrationMetadata,
  SynologyOverview,
  SynologySection,
  SynologySectionReason,
} from "@dashboard/synology";
import { Alert, Badge, PageContainer, PageHeader } from "@dashboard/ui";
import { AppIcon } from "../../apps/app-icon";
import { getBoardCaller } from "../../../lib/server/board-api";
import { dockerUserError } from "../docker-error";
import { resolveIntegrationDetail } from "../resolve-integration-detail";
import { synologyUserError } from "../synology-error";
import { SynologyRefreshButton } from "../synology-refresh-button";

const STATE_LABELS = {
  created: "Créé",
  running: "En cours",
  paused: "En pause",
  restarting: "Redémarrage",
  removing: "Suppression",
  exited: "Arrêté",
  dead: "Mort",
  unknown: "Inconnu",
} as const;

function GenericIntegrationDetail({ integration }: { integration: IntegrationDto }) {
  if (integration.type === "docker" || integration.type === "synology") redirect("/forbidden");
  return (
    <PageContainer>
      <PageHeader title={integration.name} description={integration.type} />
      <p className="ui-muted">Cette intégration n&apos;a pas encore de vue dédiée.</p>
      <Link className="ui-btn" href={`/integrations/${integration.id}/edit`}>
        Modifier
      </Link>
    </PageContainer>
  );
}

async function DockerIntegrationDetail({
  id,
  metadata,
  caller,
}: {
  id: string;
  metadata: DockerIntegrationMetadata;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  if (!metadata.enabled) {
    return (
      <PageContainer>
        <PageHeader title={metadata.name} description="Docker" />
        <Alert tone="warning">Cette intégration Docker est désactivée.</Alert>
      </PageContainer>
    );
  }
  let error: string | null = null;
  let system: Awaited<ReturnType<typeof caller.docker.system.get>> | null = null;
  let containers: Awaited<ReturnType<typeof caller.docker.containers.list>> = [];
  try {
    [system, containers] = await Promise.all([
      caller.docker.system.get({ integrationId: id }),
      caller.docker.containers.list({ integrationId: id, limit: 100 }),
    ]);
  } catch (caught) {
    error = dockerUserError(caught);
  }
  const running = containers.filter((item) => item.state === "running").length;
  const exited = containers.filter((item) => item.state === "exited").length;
  const restarting = containers.filter((item) => item.state === "restarting").length;
  const paused = containers.filter((item) => item.state === "paused").length;
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="Docker" />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {system ? (
        <section className="docker-summary">
          <p>Engine {system.engineVersion}</p>
          <p>API négociée {system.negotiatedApiVersion}</p>
          <p>
            {containers.length} conteneurs · {running} en cours · {exited} arrêtés
            {restarting ? ` · ${restarting} redémarrage` : ""}
            {paused ? ` · ${paused} en pause` : ""}
          </p>
        </section>
      ) : null}
      {containers.length > 0 ? (
        <table className="docker-table">
          <thead>
            <tr>
              <th>Conteneur</th>
              <th>Image</th>
              <th>État</th>
              <th>Ports</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {containers.map((item) => {
              const name = item.names[0] ?? item.shortId;
              return (
                <tr key={item.id}>
                  <td>
                    <div className="docker-container-identity">
                      <AppIcon
                        src={item.recognizedApp?.iconPath}
                        name={item.recognizedApp?.name ?? name}
                      />
                      <div>
                        <strong>{name}</strong>
                        {item.recognizedApp?.lifecycleStatus === "legacy" ? (
                          <Badge tone="warning">Legacy</Badge>
                        ) : null}
                        {item.recognizedApp?.lifecycleStatus === "retired" ? (
                          <Badge tone="danger">Retiré</Badge>
                        ) : null}
                        {item.recognizedApp?.replacedByName ? (
                          <p className="ui-muted">
                            Remplacé par {item.recognizedApp.replacedByName}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td>{item.image}</td>
                  <td>
                    <Badge>{STATE_LABELS[item.state]}</Badge>
                    <p className="ui-muted">{item.statusText || "—"}</p>
                  </td>
                  <td>
                    {item.ports[0]
                      ? `${item.ports[0].publicPort ?? item.ports[0].privatePort}/${item.ports[0].protocol}`
                      : "—"}
                  </td>
                  <td>
                    <Link
                      className="ui-btn ui-btn-primary"
                      href={`/integrations/${id}/containers/${item.id}`}
                    >
                      Voir
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      <div className="docker-container-list">
        {containers.map((item) => {
          const name = item.names[0] ?? item.shortId;
          return (
            <article key={item.id} className="docker-container-card">
              <div className="docker-container-identity">
                <AppIcon
                  src={item.recognizedApp?.iconPath}
                  name={item.recognizedApp?.name ?? name}
                />
                <div>
                  <h2>{name}</h2>
                  <p className="ui-muted">{item.image}</p>
                </div>
              </div>
              <div className="docker-container-meta">
                <Badge>{STATE_LABELS[item.state]}</Badge>
                <span className="ui-muted">{item.statusText || "—"}</span>
                {item.ports[0] ? (
                  <span className="ui-muted">
                    {item.ports[0].publicPort ?? item.ports[0].privatePort}/{item.ports[0].protocol}
                  </span>
                ) : null}
                {item.recognizedApp?.lifecycleStatus === "legacy" ? (
                  <Badge tone="warning">Legacy</Badge>
                ) : null}
                {item.recognizedApp?.lifecycleStatus === "retired" ? (
                  <Badge tone="danger">Retiré</Badge>
                ) : null}
                {item.recognizedApp?.replacedByName ? (
                  <span className="ui-muted">Remplacé par {item.recognizedApp.replacedByName}</span>
                ) : null}
              </div>
              <Link
                className="ui-btn ui-btn-primary"
                href={`/integrations/${id}/containers/${item.id}`}
              >
                Voir
              </Link>
            </article>
          );
        })}
      </div>
      {!error && containers.length === 0 ? (
        <p className="ui-muted">Aucun conteneur renvoyé par Docker.</p>
      ) : null}
    </PageContainer>
  );
}

function formatBytes(value: number | null): string {
  if (value === null) return "Indisponible";
  const gib = value / 1024 / 1024 / 1024;
  if (gib >= 1) return `${gib.toFixed(1)} Gio`;
  const mib = value / 1024 / 1024;
  if (mib >= 1) return `${mib.toFixed(1)} Mio`;
  return `${value} o`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "Indisponible";
  return `${Math.round(value)} %`;
}

function formatUptime(value: number | null): string {
  if (value === null) return "Indisponible";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours} h ${minutes} min`;
}

function formatTemperature(value: number | null): string {
  if (value === null) return "Indisponible";
  return `${Math.round(value)} °C`;
}

function statusLabel(value: string): string {
  switch (value) {
    case "normal":
      return "Normal";
    case "degraded":
      return "Dégradé";
    case "warning":
      return "Attention";
    case "critical":
      return "Critique";
    case "unknown":
      return "Inconnu";
    default:
      return value;
  }
}

function sectionReasonLabel(reason: SynologySectionReason | undefined): string {
  switch (reason) {
    case "api-unavailable":
      return "API DSM indisponible.";
    case "permission-denied":
      return "Le compte DSM n'a pas le privilège de lire ces informations.";
    case "timeout":
      return "Délai dépassé pour cette section DSM.";
    case "invalid-response":
      return "Réponse DSM invalide.";
    case "unsupported-version":
      return "Version d'API DSM non supportée.";
    case "unknown":
    case undefined:
      return "Section DSM indisponible.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

function SectionStatus({ section }: { section: SynologySection<unknown> }) {
  switch (section.status) {
    case "available":
      return null;
    case "degraded":
      return <Alert tone="warning">Données DSM partiellement dégradées.</Alert>;
    case "unavailable":
      return <Alert tone="warning">{sectionReasonLabel(section.reason)}</Alert>;
    default: {
      const _exhaustive: never = section.status;
      return _exhaustive;
    }
  }
}

async function SynologyIntegrationDetail({
  id,
  metadata,
  caller,
}: {
  id: string;
  metadata: SynologyIntegrationMetadata;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  if (!metadata.enabled) {
    return (
      <PageContainer>
        <PageHeader title={metadata.name} description="Synology DSM" />
        <Alert tone="warning">Cette intégration Synology est désactivée.</Alert>
      </PageContainer>
    );
  }
  let error: string | null = null;
  let overview: SynologyOverview | null = null;
  try {
    overview = await caller.synology.overview.get({ integrationId: id });
  } catch (caught) {
    error = synologyUserError(caught);
  }
  const system = overview?.system.data;
  const resources = overview?.resources.data;
  const storage = overview?.storage.data;
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="Synology DSM" />
      <SynologyRefreshButton integrationId={id} />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {overview?.status === "degraded" ? (
        <Alert tone="warning">
          Vue Synology partielle : certaines sections DSM sont indisponibles.
        </Alert>
      ) : null}
      {overview ? (
        <>
          <p className="ui-muted">Actualisé {overview.fetchedAt}</p>
          <section className="synology-summary">
            <h2>Système</h2>
            <SectionStatus section={overview.system} />
            <p>Modèle {system?.model ?? "Indisponible"}</p>
            <p>DSM {system?.dsmVersion ?? "Indisponible"}</p>
            <p>Uptime {formatUptime(system?.uptimeSeconds ?? null)}</p>
            <p>Température {formatTemperature(system?.systemTemperatureC ?? null)}</p>
            <p>RAM totale {formatBytes(system?.ramTotalBytes ?? null)}</p>
          </section>
          <section className="synology-summary">
            <h2>Ressources</h2>
            <SectionStatus section={overview.resources} />
            <p>CPU {formatPercent(resources?.cpuTotalPercent ?? null)}</p>
            <p>
              RAM {formatBytes(resources?.memoryUsedBytes ?? null)} /{" "}
              {formatBytes(resources?.memoryTotalBytes ?? null)} (
              {formatPercent(resources?.memoryPercentUsed ?? null)})
            </p>
          </section>
          <section>
            <h2>Stockage</h2>
            <SectionStatus section={overview.storage} />
            {storage?.volumes.length ? (
              <table className="synology-table">
                <thead>
                  <tr>
                    <th>Volume</th>
                    <th>Capacité</th>
                    <th>Utilisé / libre</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {storage.volumes.map((volume) => (
                    <tr key={volume.id}>
                      <td>{volume.name}</td>
                      <td>{formatBytes(volume.totalBytes)}</td>
                      <td>
                        {formatBytes(volume.usedBytes)} / {formatBytes(volume.freeBytes)} (
                        {formatPercent(volume.usedPercent)})
                      </td>
                      <td>
                        <Badge>{statusLabel(volume.status)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : overview.storage.status !== "unavailable" ? (
              <p className="ui-muted">Aucun volume renvoyé par DSM.</p>
            ) : null}
            {storage?.disks.length ? (
              <table className="synology-table">
                <thead>
                  <tr>
                    <th>Disque</th>
                    <th>Modèle</th>
                    <th>Capacité</th>
                    <th>État</th>
                    <th>Température</th>
                    <th>SMART</th>
                  </tr>
                </thead>
                <tbody>
                  {storage.disks.map((disk) => (
                    <tr key={disk.id}>
                      <td>{disk.displayName}</td>
                      <td>{disk.model ?? "Indisponible"}</td>
                      <td>{formatBytes(disk.sizeBytes)}</td>
                      <td>
                        <Badge>{statusLabel(disk.status)}</Badge>
                      </td>
                      <td>{formatTemperature(disk.temperatureC)}</td>
                      <td>{disk.smartStatus ? statusLabel(disk.smartStatus) : "Indisponible"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : overview.storage.status !== "unavailable" ? (
              <p className="ui-muted">Aucun disque renvoyé par DSM.</p>
            ) : null}
          </section>
        </>
      ) : null}
    </PageContainer>
  );
}

export default async function IntegrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const caller = await getBoardCaller();
    const detail = await resolveIntegrationDetail(id, caller);
    switch (detail.kind) {
      case "docker":
        return <DockerIntegrationDetail id={id} metadata={detail.metadata} caller={caller} />;
      case "synology":
        return <SynologyIntegrationDetail id={id} metadata={detail.metadata} caller={caller} />;
      case "generic":
        return <GenericIntegrationDetail integration={detail.integration} />;
      default: {
        const _exhaustive: never = detail;
        return _exhaustive;
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "UNAUTHORIZED")
      redirect("/login");
    if (error && typeof error === "object" && "code" in error && error.code === "FORBIDDEN")
      redirect("/forbidden");
    throw error;
  }
}
