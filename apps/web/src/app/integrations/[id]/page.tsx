import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import type {
  BeszelHostStatus,
  BeszelIntegrationMetadata,
  BeszelOverview,
  BeszelSectionReason,
} from "@dashboard/beszel";
import type { PrometheusIntegrationMetadata, PrometheusQueryDto } from "@dashboard/prometheus";
import type {
  GrafanaIntegrationMetadata,
  GrafanaOverview,
  GrafanaSectionReason,
} from "@dashboard/grafana";
import type { NtfyIntegrationMetadata, NtfyOverview, NtfySectionReason } from "@dashboard/ntfy";
import type {
  ProwlarrIntegrationMetadata,
  ProwlarrOverview,
  ProwlarrSectionReason,
} from "@dashboard/prowlarr";
import type {
  QbittorrentIntegrationMetadata,
  QbittorrentOverview,
  QbittorrentSectionReason,
} from "@dashboard/qbittorrent";
import type { SeerrIntegrationMetadata, SeerrOverview, SeerrSectionReason } from "@dashboard/seerr";
import type {
  RadarrIntegrationMetadata,
  RadarrOverview,
  RadarrSectionReason,
} from "@dashboard/radarr";
import type {
  SonarrIntegrationMetadata,
  SonarrOverview,
  SonarrSectionReason,
} from "@dashboard/sonarr";
import type {
  ProxmoxIntegrationMetadata,
  ProxmoxNodeStatus,
  ProxmoxOverview,
  ProxmoxSectionReason,
} from "@dashboard/proxmox";
import type {
  UptimeKumaIntegrationMetadata,
  UptimeKumaMonitorStatus,
  UptimeKumaOverview,
  UptimeKumaSectionReason,
} from "@dashboard/uptime-kuma";
import type { DockerIntegrationMetadata } from "@dashboard/docker";
import type { IntegrationDto } from "@dashboard/integrations";
import type {
  ImmichIntegrationMetadata,
  ImmichOverview,
  ImmichSectionReason,
} from "@dashboard/immich";
import type {
  JellyfinIntegrationMetadata,
  JellyfinOverview,
  JellyfinSectionReason,
} from "@dashboard/jellyfin";
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
import { beszelUserError } from "../beszel-error";
import { BeszelRefreshButton } from "../beszel-refresh-button";
import { prometheusUserError } from "../prometheus-error";
import { PrometheusRefreshButton } from "../prometheus-refresh-button";
import { uptimeKumaUserError } from "../uptime-kuma-error";
import { UptimeKumaRefreshButton } from "../uptime-kuma-refresh-button";
import { grafanaUserError } from "../grafana-error";
import { GrafanaRefreshButton } from "../grafana-refresh-button";
import { ntfyUserError } from "../ntfy-error";
import { NtfyRefreshButton } from "../ntfy-refresh-button";
import { prowlarrUserError } from "../prowlarr-error";
import { ProwlarrRefreshButton } from "../prowlarr-refresh-button";
import { qbittorrentUserError } from "../qbittorrent-error";
import { QbittorrentRefreshButton } from "../qbittorrent-refresh-button";
import { seerrUserError } from "../seerr-error";
import { SeerrRefreshButton } from "../seerr-refresh-button";
import { radarrUserError } from "../radarr-error";
import { RadarrRefreshButton } from "../radarr-refresh-button";
import { sonarrUserError } from "../sonarr-error";
import { SonarrRefreshButton } from "../sonarr-refresh-button";
import { proxmoxUserError } from "../proxmox-error";
import { ProxmoxRefreshButton } from "../proxmox-refresh-button";
import { immichUserError } from "../immich-error";
import { ImmichRefreshButton } from "../immich-refresh-button";
import { jellyfinUserError } from "../jellyfin-error";
import { JellyfinRefreshButton } from "../jellyfin-refresh-button";
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
  if (
    integration.type === "docker" ||
    integration.type === "synology" ||
    integration.type === "jellyfin" ||
    integration.type === "immich" ||
    integration.type === "beszel" ||
    integration.type === "prometheus" ||
    integration.type === "uptime-kuma" ||
    integration.type === "proxmox" ||
    integration.type === "grafana" ||
    integration.type === "ntfy" ||
    integration.type === "prowlarr" ||
    integration.type === "qbittorrent" ||
    integration.type === "seerr" ||
    integration.type === "radarr" ||
    integration.type === "sonarr"
  )
    redirect("/forbidden");
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

function statusBadgeTone(value: string): "success" | "warning" | "danger" | "neutral" {
  switch (value) {
    case "normal":
      return "success";
    case "degraded":
    case "warning":
      return "warning";
    case "critical":
    case "crashed":
    case "error":
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

function smartStatusBadge(status: string | null) {
  if (status === null) return "Indisponible";
  return <Badge tone={statusBadgeTone(status)}>{statusLabel(status)}</Badge>;
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

async function SynologyOverviewPanel({
  id,
  caller,
}: {
  id: string;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
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
    <>
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
            {system?.temperatureWarning === true ? (
              <Alert tone="warning">DSM signale une température système anormale.</Alert>
            ) : null}
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
              <div className="ui-table-wrap synology-table-wrap">
                <table className="synology-table synology-table-volumes">
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
              </div>
            ) : overview.storage.status !== "unavailable" ? (
              <p className="ui-muted">Aucun volume renvoyé par DSM.</p>
            ) : null}
            {storage?.disks.length ? (
              <div className="ui-table-wrap synology-table-wrap">
                <table className="synology-table synology-table-disks">
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
                          <Badge tone={statusBadgeTone(disk.status)}>
                            {statusLabel(disk.status)}
                          </Badge>
                          {disk.badSectorWarning === true ? (
                            <Badge tone="warning">Secteurs défectueux</Badge>
                          ) : null}
                          {disk.remainingLifeWarning === true ? (
                            <Badge tone="warning">Durée de vie restante faible</Badge>
                          ) : null}
                        </td>
                        <td>{formatTemperature(disk.temperatureC)}</td>
                        <td>{smartStatusBadge(disk.smartStatus)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : overview.storage.status !== "unavailable" ? (
              <p className="ui-muted">Aucun disque renvoyé par DSM.</p>
            ) : null}
          </section>
        </>
      ) : null}
    </>
  );
}

function jellyfinReasonLabel(reason: JellyfinSectionReason | undefined): string {
  switch (reason) {
    case "api-unavailable":
      return "API Jellyfin indisponible.";
    case "permission-denied":
      return "Accès Jellyfin refusé.";
    case "timeout":
      return "Délai dépassé pour cette section Jellyfin.";
    case "invalid-response":
      return "Réponse Jellyfin invalide.";
    case "unauthorized":
      return "Clé API Jellyfin invalide.";
    case "rate-limited":
      return "Jellyfin a limité les requêtes.";
    case "dns":
      return "Le serveur Jellyfin est injoignable (DNS).";
    case "tls":
      return "Erreur TLS vers Jellyfin.";
    case "unreachable":
      return "Le serveur Jellyfin est injoignable.";
    case "unknown":
    case undefined:
      return "Section Jellyfin indisponible.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

function playbackModeLabel(mode: "direct-play" | "direct-stream" | "transcode" | null): string {
  switch (mode) {
    case "direct-play":
      return "Direct play";
    case "direct-stream":
      return "Direct stream";
    case "transcode":
      return "Transcode";
    case null:
      return "Indisponible";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

async function JellyfinOverviewPanel({
  id,
  caller,
}: {
  id: string;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  let error: string | null = null;
  let overview: JellyfinOverview | null = null;
  try {
    overview = await caller.jellyfin.overview.get({ integrationId: id });
  } catch (caught) {
    error = jellyfinUserError(caught);
  }
  const server = overview?.server.data;
  const sessions = overview?.sessions.data;
  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {overview?.status === "degraded" ? (
        <Alert tone="warning">
          Vue Jellyfin partielle : certaines sections sont indisponibles.
        </Alert>
      ) : null}
      {overview ? (
        <>
          <p className="ui-muted">Actualisé {overview.fetchedAt}</p>
          <section className="jellyfin-summary">
            <h2>Serveur</h2>
            {overview.server.status === "unavailable" ? (
              <Alert tone="warning">{jellyfinReasonLabel(overview.server.reason)}</Alert>
            ) : null}
            <p>{server?.serverName ?? "Indisponible"}</p>
            <p>Version {server?.version ?? "Indisponible"}</p>
            <p>{server?.productName ?? "Indisponible"}</p>
            <p>OS {server?.operatingSystem ?? "Indisponible"}</p>
          </section>
          <section>
            <h2>Sessions</h2>
            {overview.sessions.status === "unavailable" ? (
              <Alert tone="warning">{jellyfinReasonLabel(overview.sessions.reason)}</Alert>
            ) : null}
            <p>{sessions?.activeCount ?? 0} session(s) active(s)</p>
            {sessions?.sessions.length ? (
              <div className="ui-table-wrap">
                <table className="jellyfin-table">
                  <thead>
                    <tr>
                      <th>Utilisateur</th>
                      <th>Lecture</th>
                      <th>Client</th>
                      <th>Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.sessions.map((session) => (
                      <tr key={session.id}>
                        <td>{session.userLabel}</td>
                        <td>{session.nowPlaying?.name ?? "Aucune lecture"}</td>
                        <td>{session.deviceName ?? session.client ?? "Indisponible"}</td>
                        <td>{playbackModeLabel(session.playbackMode)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : overview.sessions.status !== "unavailable" ? (
              <p className="ui-muted">Aucune session active.</p>
            ) : null}
          </section>
        </>
      ) : null}
    </>
  );
}

function immichReasonLabel(reason: ImmichSectionReason | undefined): string {
  switch (reason) {
    case "api-unavailable":
      return "API Immich indisponible.";
    case "permission-denied":
      return "Accès Immich refusé.";
    case "timeout":
      return "Délai dépassé pour cette section Immich.";
    case "invalid-response":
      return "Réponse Immich invalide.";
    case "unauthorized":
      return "Clé API Immich invalide.";
    case "rate-limited":
      return "Immich a limité les requêtes.";
    case "dns":
      return "Le serveur Immich est injoignable (DNS).";
    case "tls":
      return "Erreur TLS vers Immich.";
    case "unreachable":
      return "Le serveur Immich est injoignable.";
    case "unknown":
    case undefined:
      return "Section Immich indisponible.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

async function ImmichOverviewPanel({
  id,
  caller,
}: {
  id: string;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  let error: string | null = null;
  let overview: ImmichOverview | null = null;
  try {
    overview = await caller.immich.overview.get({ integrationId: id });
  } catch (caught) {
    error = immichUserError(caught);
  }
  const server = overview?.server.data;
  const health = overview?.health.data;
  const storage = overview?.storage.data;
  const stats = overview?.stats.data;
  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {overview?.status === "degraded" ? (
        <Alert tone="warning">Vue Immich partielle : certaines sections sont indisponibles.</Alert>
      ) : null}
      {overview ? (
        <>
          <p className="ui-muted">Actualisé {overview.fetchedAt}</p>
          <section className="immich-summary">
            <h2>Serveur</h2>
            {overview.server.status === "unavailable" ? (
              <Alert tone="warning">{immichReasonLabel(overview.server.reason)}</Alert>
            ) : null}
            <p>Version {server?.version ?? "Indisponible"}</p>
            <p>
              Licence{" "}
              {server?.licensed === null ? "Indisponible" : server?.licensed ? "Oui" : "Non"}
            </p>
          </section>
          <section className="immich-summary">
            <h2>Santé</h2>
            {overview.health.status === "unavailable" ? (
              <Alert tone="warning">{immichReasonLabel(overview.health.reason)}</Alert>
            ) : null}
            <p>
              {health?.ok === true
                ? "En ligne"
                : health?.ok === false
                  ? "Hors ligne"
                  : "Indisponible"}
            </p>
          </section>
          <section className="immich-summary">
            <h2>Médias</h2>
            {overview.stats.status === "unavailable" ? (
              <Alert tone="warning">{immichReasonLabel(overview.stats.reason)}</Alert>
            ) : null}
            <p>Photos {stats?.photos ?? "Indisponible"}</p>
            <p>Vidéos {stats?.videos ?? "Indisponible"}</p>
            <p>Usage {formatBytes(stats?.usageBytes ?? null)}</p>
          </section>
          <section className="immich-summary">
            <h2>Stockage</h2>
            {overview.storage.status === "unavailable" ? (
              <Alert tone="warning">{immichReasonLabel(overview.storage.reason)}</Alert>
            ) : null}
            <p>
              {formatBytes(storage?.diskUseBytes ?? null)} /{" "}
              {formatBytes(storage?.diskSizeBytes ?? null)} (
              {formatPercent(storage?.diskUsagePercent ?? null)})
            </p>
            <p>Libre {formatBytes(storage?.diskAvailableBytes ?? null)}</p>
          </section>
        </>
      ) : null}
    </>
  );
}

async function ImmichIntegrationDetail({
  id,
  metadata,
  caller,
}: {
  id: string;
  metadata: ImmichIntegrationMetadata;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  if (!metadata.enabled) {
    return (
      <PageContainer>
        <PageHeader title={metadata.name} description="Immich" />
        <Alert tone="warning">Cette intégration Immich est désactivée.</Alert>
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="Immich" />
      <ImmichRefreshButton integrationId={id} />
      <Suspense fallback={<p className="ui-muted">Chargement des informations Immich…</p>}>
        <ImmichOverviewPanel id={id} caller={caller} />
      </Suspense>
    </PageContainer>
  );
}

async function JellyfinIntegrationDetail({
  id,
  metadata,
  caller,
}: {
  id: string;
  metadata: JellyfinIntegrationMetadata;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  if (!metadata.enabled) {
    return (
      <PageContainer>
        <PageHeader title={metadata.name} description="Jellyfin" />
        <Alert tone="warning">Cette intégration Jellyfin est désactivée.</Alert>
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="Jellyfin" />
      <JellyfinRefreshButton integrationId={id} />
      <Suspense fallback={<p className="ui-muted">Chargement des informations Jellyfin…</p>}>
        <JellyfinOverviewPanel id={id} caller={caller} />
      </Suspense>
    </PageContainer>
  );
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
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="Synology DSM" />
      <SynologyRefreshButton integrationId={id} />
      <Suspense fallback={<p className="ui-muted">Chargement des informations DSM…</p>}>
        <SynologyOverviewPanel id={id} caller={caller} />
      </Suspense>
    </PageContainer>
  );
}

function beszelReasonLabel(reason: BeszelSectionReason | undefined): string {
  switch (reason) {
    case "api-unavailable":
      return "API Beszel indisponible.";
    case "permission-denied":
      return "Accès Beszel refusé.";
    case "timeout":
      return "Délai dépassé pour cette section Beszel.";
    case "invalid-response":
      return "Réponse Beszel invalide.";
    case "unauthorized":
      return "Identifiant ou mot de passe Beszel invalide.";
    case "rate-limited":
      return "Beszel a limité les requêtes.";
    case "dns":
      return "Le serveur Beszel est injoignable (DNS).";
    case "tls":
      return "Erreur TLS vers Beszel.";
    case "unreachable":
      return "Le serveur Beszel est injoignable.";
    case "unknown":
    case undefined:
      return "Section Beszel indisponible.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

function beszelStatusLabel(status: BeszelHostStatus): string {
  switch (status) {
    case "up":
      return "En ligne";
    case "down":
      return "Hors ligne";
    case "paused":
      return "En pause";
    case "pending":
      return "En attente";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

async function BeszelOverviewPanel({
  id,
  caller,
}: {
  id: string;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  let error: string | null = null;
  let overview: BeszelOverview | null = null;
  try {
    overview = await caller.beszel.overview.get({ integrationId: id });
  } catch (caught) {
    error = beszelUserError(caught);
  }
  const hosts = overview?.hosts.data;
  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {overview?.status === "degraded" ? (
        <Alert tone="warning">
          Vue Beszel partielle : certains hôtes sont hors ligne ou en attente.
        </Alert>
      ) : null}
      {overview ? (
        <>
          <p className="ui-muted">Actualisé {overview.fetchedAt}</p>
          <section className="beszel-summary">
            <h2>État</h2>
            {overview.hosts.status === "unavailable" ? (
              <Alert tone="warning">{beszelReasonLabel(overview.hosts.reason)}</Alert>
            ) : null}
            <p>
              {hosts?.upCount ?? 0} / {hosts?.hostCount ?? 0} en ligne
              {hosts?.truncated ? " · liste tronquée" : ""}
            </p>
            <p>{hosts?.downCount ?? 0} hors ligne</p>
            <p>{hosts?.pausedCount ?? 0} en pause</p>
            <p>{hosts?.pendingCount ?? 0} en attente</p>
          </section>
          <section className="beszel-hosts">
            <h2>Hôtes</h2>
            {hosts?.hosts.length ? (
              <ul className="beszel-host-list">
                {hosts.hosts.map((host) => (
                  <li key={host.id} className="beszel-host-card">
                    <p>
                      <strong>{host.name}</strong>
                    </p>
                    <p>{beszelStatusLabel(host.status)}</p>
                    {host.host ? <p className="ui-muted">{host.host}</p> : null}
                    <p>CPU {formatPercent(host.cpuPercent)}</p>
                    <p>RAM {formatPercent(host.memoryPercent)}</p>
                    <p>Disque {formatPercent(host.diskPercent)}</p>
                    {host.networkBytes !== null ? (
                      <p>Réseau {formatBytes(host.networkBytes)}</p>
                    ) : null}
                    {host.updatedAt ? <p className="ui-muted">MAJ {host.updatedAt}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ui-muted">Aucun hôte Beszel.</p>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

async function BeszelIntegrationDetail({
  id,
  metadata,
  caller,
}: {
  id: string;
  metadata: BeszelIntegrationMetadata;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  if (!metadata.enabled) {
    return (
      <PageContainer>
        <PageHeader title={metadata.name} description="Beszel" />
        <Alert tone="warning">Cette intégration Beszel est désactivée.</Alert>
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="Beszel" />
      <BeszelRefreshButton integrationId={id} />
      <Suspense fallback={<p className="ui-muted">Chargement des hôtes Beszel…</p>}>
        <BeszelOverviewPanel id={id} caller={caller} />
      </Suspense>
    </PageContainer>
  );
}

function uptimeKumaReasonLabel(reason: UptimeKumaSectionReason | undefined): string {
  switch (reason) {
    case "api-unavailable":
      return "API Uptime Kuma indisponible.";
    case "permission-denied":
      return "Accès Uptime Kuma refusé.";
    case "timeout":
      return "Délai dépassé pour cette section Uptime Kuma.";
    case "invalid-response":
      return "Réponse Uptime Kuma invalide.";
    case "unauthorized":
      return "Clé API Uptime Kuma invalide.";
    case "rate-limited":
      return "Uptime Kuma a limité les requêtes.";
    case "dns":
      return "Le serveur Uptime Kuma est injoignable (DNS).";
    case "tls":
      return "Erreur TLS vers Uptime Kuma.";
    case "unreachable":
      return "Le serveur Uptime Kuma est injoignable.";
    case "unknown":
    case undefined:
      return "Section Uptime Kuma indisponible.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

function uptimeKumaStatusLabel(status: UptimeKumaMonitorStatus): string {
  switch (status) {
    case "up":
      return "En ligne";
    case "down":
      return "Hors ligne";
    case "pending":
      return "En attente";
    case "maintenance":
      return "Maintenance";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function formatLatencyMs(value: number | null): string {
  if (value === null) return "Indisponible";
  return `${Math.round(value)} ms`;
}

async function UptimeKumaOverviewPanel({
  id,
  caller,
}: {
  id: string;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  let error: string | null = null;
  let overview: UptimeKumaOverview | null = null;
  try {
    overview = await caller.uptimeKuma.overview.get({ integrationId: id });
  } catch (caught) {
    error = uptimeKumaUserError(caught);
  }
  const monitors = overview?.monitors.data;
  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {overview?.status === "degraded" ? (
        <Alert tone="warning">
          Vue Uptime Kuma partielle : certains moniteurs sont hors ligne, en attente ou la liste est
          tronquée.
        </Alert>
      ) : null}
      {overview ? (
        <>
          <p className="ui-muted">Actualisé {overview.fetchedAt}</p>
          <p className="ui-muted">
            Les incidents ne sont pas exposés par GET /metrics ; cette vue ne les invente pas.
          </p>
          <section className="uptime-kuma-summary">
            <h2>État</h2>
            {overview.monitors.status === "unavailable" ? (
              <Alert tone="warning">{uptimeKumaReasonLabel(overview.monitors.reason)}</Alert>
            ) : null}
            <p>
              {monitors?.upCount ?? 0} / {monitors?.monitorCount ?? 0} en ligne
              {monitors?.truncated ? " · liste tronquée" : ""}
            </p>
            <p>{monitors?.downCount ?? 0} hors ligne</p>
            <p>{monitors?.pendingCount ?? 0} en attente</p>
            <p>{monitors?.maintenanceCount ?? 0} en maintenance</p>
          </section>
          <section className="uptime-kuma-monitors">
            <h2>Moniteurs</h2>
            {monitors?.monitors.length ? (
              <ul className="uptime-kuma-monitor-list">
                {monitors.monitors.map((monitor) => (
                  <li key={monitor.id} className="uptime-kuma-monitor-card">
                    <p>
                      <strong>{monitor.name}</strong>
                    </p>
                    <p>{uptimeKumaStatusLabel(monitor.status)}</p>
                    <p>Latence {formatLatencyMs(monitor.latencyMs)}</p>
                    {monitor.uptimePercent !== null ? (
                      <p>Disponibilité {formatPercent(monitor.uptimePercent)}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ui-muted">Aucun moniteur Uptime Kuma.</p>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

async function UptimeKumaIntegrationDetail({
  id,
  metadata,
  caller,
}: {
  id: string;
  metadata: UptimeKumaIntegrationMetadata;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  if (!metadata.enabled) {
    return (
      <PageContainer>
        <PageHeader title={metadata.name} description="Uptime Kuma" />
        <Alert tone="warning">Cette intégration Uptime Kuma est désactivée.</Alert>
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="Uptime Kuma" />
      <UptimeKumaRefreshButton integrationId={id} />
      <Suspense fallback={<p className="ui-muted">Chargement des moniteurs Uptime Kuma…</p>}>
        <UptimeKumaOverviewPanel id={id} caller={caller} />
      </Suspense>
    </PageContainer>
  );
}

function proxmoxReasonLabel(reason: ProxmoxSectionReason | undefined): string {
  switch (reason) {
    case "api-unavailable":
      return "API Proxmox indisponible.";
    case "permission-denied":
      return "Permission Proxmox insuffisante.";
    case "timeout":
      return "Délai dépassé vers Proxmox.";
    case "invalid-response":
      return "Réponse Proxmox invalide.";
    case "unauthorized":
      return "Jeton API Proxmox invalide.";
    case "rate-limited":
      return "Trop d'actualisations Proxmox.";
    case "dns":
      return "Le serveur Proxmox est injoignable (DNS).";
    case "tls":
      return "Erreur TLS vers Proxmox.";
    case "unreachable":
      return "Le serveur Proxmox est injoignable.";
    case "unknown":
    case undefined:
      return "Section Proxmox indisponible.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

function proxmoxNodeStatusLabel(status: ProxmoxNodeStatus): string {
  switch (status) {
    case "online":
      return "En ligne";
    case "offline":
      return "Hors ligne";
    case "unknown":
      return "Inconnu";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function formatProxmoxPercent(value: number | null): string {
  if (value === null) return "Indisponible";
  return `${Math.round(value * 100)} %`;
}

function formatProxmoxBytes(value: number | null): string {
  if (value === null) return "Indisponible";
  if (value >= 1_073_741_824) return `${(value / 1_073_741_824).toFixed(1)} Gio`;
  if (value >= 1_048_576) return `${Math.round(value / 1_048_576)} Mio`;
  return `${value} o`;
}

function formatProxmoxUptime(value: number | null): string {
  if (value === null) return "Indisponible";
  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3_600);
  if (days > 0) return `${days} j ${hours} h`;
  const minutes = Math.floor((value % 3_600) / 60);
  return `${hours} h ${minutes} min`;
}

async function ProxmoxOverviewPanel({
  id,
  caller,
}: {
  id: string;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  let error: string | null = null;
  let overview: ProxmoxOverview | null = null;
  try {
    overview = await caller.proxmox.overview.get({ integrationId: id });
  } catch (caught) {
    error = proxmoxUserError(caught);
  }
  const cluster = overview?.cluster.data;
  const nodes = overview?.nodes.data;
  const guests = overview?.guests.data;
  const storage = overview?.storage.data;
  const version = overview?.version.data;
  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {overview?.status === "degraded" ? (
        <Alert tone="warning">Vue Proxmox partielle : certaines sections sont indisponibles.</Alert>
      ) : null}
      {overview ? (
        <>
          <p className="ui-muted">Actualisé {overview.fetchedAt}</p>
          <p className="ui-muted">
            Les noms de VM et CT ne sont pas exposés. Lecture seule, sans mutation.
          </p>
          <section className="proxmox-summary">
            <h2>Cluster</h2>
            {overview.cluster.status === "unavailable" ? (
              <Alert tone="warning">{proxmoxReasonLabel(overview.cluster.reason)}</Alert>
            ) : null}
            <p>Version {version?.version ?? "Indisponible"}</p>
            <p>
              Nœuds {cluster?.onlineNodeCount ?? 0} / {cluster?.nodeCount ?? 0} en ligne
            </p>
            <p>
              Quorum{" "}
              {cluster?.quorate === true
                ? "OK"
                : cluster?.quorate === false
                  ? "Absent"
                  : "Indisponible"}
            </p>
          </section>
          <section className="proxmox-guests">
            <h2>Invités</h2>
            {overview.guests.status === "unavailable" ? (
              <Alert tone="warning">{proxmoxReasonLabel(overview.guests.reason)}</Alert>
            ) : null}
            <p>
              {guests?.vmRunning ?? 0} / {guests?.vmCount ?? 0} VM
            </p>
            <p>
              {guests?.lxcRunning ?? 0} / {guests?.lxcCount ?? 0} CT
            </p>
          </section>
          <section className="proxmox-storage">
            <h2>Stockage</h2>
            {overview.storage.status === "unavailable" ? (
              <Alert tone="warning">{proxmoxReasonLabel(overview.storage.reason)}</Alert>
            ) : null}
            <p>{storage?.storageCount ?? 0} volumes</p>
            <p>
              {formatProxmoxBytes(storage?.usedBytes ?? null)} /{" "}
              {formatProxmoxBytes(storage?.totalBytes ?? null)}
            </p>
          </section>
          <section className="proxmox-nodes">
            <h2>Nœuds</h2>
            {overview.nodes.status === "unavailable" ? (
              <Alert tone="warning">{proxmoxReasonLabel(overview.nodes.reason)}</Alert>
            ) : null}
            {nodes?.nodes.length ? (
              <ul className="proxmox-node-list">
                {nodes.nodes.map((node) => (
                  <li key={node.id} className="proxmox-node-card">
                    <p>{node.name}</p>
                    <p>{proxmoxNodeStatusLabel(node.status)}</p>
                    <p>CPU {formatProxmoxPercent(node.cpuRatio)}</p>
                    <p>
                      RAM {formatProxmoxBytes(node.memoryUsedBytes)} /{" "}
                      {formatProxmoxBytes(node.memoryTotalBytes)}
                    </p>
                    <p>Uptime {formatProxmoxUptime(node.uptimeSeconds)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ui-muted">Aucun nœud Proxmox.</p>
            )}
            {nodes?.truncated ? <p className="ui-muted">Liste de nœuds tronquée.</p> : null}
          </section>
        </>
      ) : null}
    </>
  );
}

async function ProxmoxIntegrationDetail({
  id,
  metadata,
  caller,
}: {
  id: string;
  metadata: ProxmoxIntegrationMetadata;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  if (!metadata.enabled) {
    return (
      <PageContainer>
        <PageHeader title={metadata.name} description="Proxmox VE" />
        <Alert tone="warning">Cette intégration Proxmox est désactivée.</Alert>
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="Proxmox VE" />
      <ProxmoxRefreshButton integrationId={id} />
      <Suspense fallback={<p className="ui-muted">Chargement de Proxmox…</p>}>
        <ProxmoxOverviewPanel id={id} caller={caller} />
      </Suspense>
    </PageContainer>
  );
}

function grafanaReasonLabel(reason: GrafanaSectionReason | undefined): string {
  switch (reason) {
    case "api-unavailable":
      return "API Grafana indisponible.";
    case "permission-denied":
      return "Permission Grafana insuffisante.";
    case "timeout":
      return "Délai dépassé vers Grafana.";
    case "invalid-response":
      return "Réponse Grafana invalide.";
    case "unauthorized":
      return "Jeton de compte de service Grafana invalide.";
    case "rate-limited":
      return "Trop d'actualisations Grafana.";
    case "dns":
      return "Le serveur Grafana est injoignable (DNS).";
    case "tls":
      return "Erreur TLS vers Grafana.";
    case "unreachable":
      return "Le serveur Grafana est injoignable.";
    case "unknown":
    case undefined:
      return "Section Grafana indisponible.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

async function GrafanaOverviewPanel({
  id,
  caller,
}: {
  id: string;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  let error: string | null = null;
  let overview: GrafanaOverview | null = null;
  try {
    overview = await caller.grafana.overview.get({ integrationId: id });
  } catch (caught) {
    error = grafanaUserError(caught);
  }
  const health = overview?.health.data;
  const dashboards = overview?.dashboards.data;
  const folders = overview?.folders.data;
  const alerts = overview?.alerts.data;
  const datasources = overview?.datasources.data;
  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {overview?.status === "degraded" ? (
        <Alert tone="warning">Vue Grafana partielle : certaines sections sont indisponibles.</Alert>
      ) : null}
      {overview ? (
        <>
          <p className="ui-muted">Actualisé {overview.fetchedAt}</p>
          <p className="ui-muted">
            Compteurs uniquement. Titres, URLs, noms de sources et charges d&apos;alertes ne sont
            pas exposés. Lecture seule, sans iframe ni proxy.
          </p>
          <section className="grafana-health">
            <h2>Santé</h2>
            {overview.health.status === "unavailable" ? (
              <Alert tone="warning">{grafanaReasonLabel(overview.health.reason)}</Alert>
            ) : null}
            <p>Version {health?.version ?? "Indisponible"}</p>
            <p>
              Base de données{" "}
              {health?.database === "ok"
                ? "OK"
                : health?.database === "failing"
                  ? "En échec"
                  : "Indisponible"}
            </p>
          </section>
          <section className="grafana-dashboards">
            <h2>Tableaux de bord</h2>
            {overview.dashboards.status === "unavailable" ? (
              <Alert tone="warning">{grafanaReasonLabel(overview.dashboards.reason)}</Alert>
            ) : null}
            <p>
              {dashboards
                ? `${dashboards.count} tableaux de bord`
                : "Tableaux de bord indisponibles."}
            </p>
            {dashboards?.truncated ? (
              <p className="ui-muted">Liste tronquée (limite 100).</p>
            ) : null}
          </section>
          <section className="grafana-folders">
            <h2>Dossiers</h2>
            {overview.folders.status === "unavailable" ? (
              <Alert tone="warning">{grafanaReasonLabel(overview.folders.reason)}</Alert>
            ) : null}
            <p>{folders ? `${folders.count} dossiers` : "Dossiers indisponibles."}</p>
            {folders?.truncated ? <p className="ui-muted">Liste tronquée (limite 100).</p> : null}
          </section>
          <section className="grafana-alerts">
            <h2>Alertes</h2>
            {overview.alerts.status === "unavailable" ? (
              <Alert tone="warning">{grafanaReasonLabel(overview.alerts.reason)}</Alert>
            ) : null}
            {alerts ? (
              <>
                <p>{alerts.firing} firing</p>
                <p>{alerts.pending} pending</p>
                <p>{alerts.inactive} inactive</p>
                <p>{alerts.other} other</p>
              </>
            ) : (
              <p className="ui-muted">Alertes indisponibles.</p>
            )}
          </section>
          <section className="grafana-datasources">
            <h2>Sources de données</h2>
            {overview.datasources.status === "unavailable" ? (
              <Alert tone="warning">{grafanaReasonLabel(overview.datasources.reason)}</Alert>
            ) : null}
            <p>
              {datasources ? `${datasources.count} sources` : "Sources de données indisponibles."}
            </p>
            {datasources?.types.length ? (
              <ul>
                {datasources.types.map((entry) => (
                  <li key={entry.type}>
                    {entry.type} · {entry.count}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </>
      ) : null}
    </>
  );
}

function ntfyReasonLabel(reason: NtfySectionReason | undefined): string {
  switch (reason) {
    case "api-unavailable":
      return "API ntfy indisponible.";
    case "permission-denied":
      return "Permission ntfy insuffisante.";
    case "timeout":
      return "Délai dépassé vers ntfy.";
    case "invalid-response":
      return "Réponse ntfy invalide.";
    case "unauthorized":
      return "Jeton d'accès ntfy invalide.";
    case "rate-limited":
      return "Trop d'actualisations ntfy.";
    case "dns":
      return "Le serveur ntfy est injoignable (DNS).";
    case "tls":
      return "Erreur TLS vers ntfy.";
    case "unreachable":
      return "Le serveur ntfy est injoignable.";
    case "unknown":
    case undefined:
      return "Section ntfy indisponible.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

function formatNtfyRate(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toPrecision(6).replace(/\.?0+$/u, "");
}

async function NtfyOverviewPanel({
  id,
  caller,
}: {
  id: string;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  let error: string | null = null;
  let overview: NtfyOverview | null = null;
  try {
    overview = await caller.ntfy.overview.get({ integrationId: id });
  } catch (caught) {
    error = ntfyUserError(caught);
  }
  const health = overview?.health.data;
  const stats = overview?.stats.data;
  const version = overview?.version.data;
  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {overview?.status === "degraded" ? (
        <Alert tone="warning">Vue ntfy partielle : certaines sections sont indisponibles.</Alert>
      ) : null}
      {overview ? (
        <>
          <p className="ui-muted">Actualisé {overview.fetchedAt}</p>
          <p className="ui-muted">
            Compteurs publics uniquement. Aucun nom de topic, aucun corps de message, aucune
            publication. Lecture seule.
          </p>
          <section className="ntfy-health">
            <h2>Santé</h2>
            {overview.health.status === "unavailable" ? (
              <Alert tone="warning">{ntfyReasonLabel(overview.health.reason)}</Alert>
            ) : null}
            <p>
              {health?.healthy === true
                ? "Santé OK"
                : health?.healthy === false
                  ? "Santé en échec"
                  : "Indisponible"}
            </p>
          </section>
          <section className="ntfy-version">
            <h2>Version</h2>
            {overview.version.status === "unavailable" ? (
              <Alert tone="warning">{ntfyReasonLabel(overview.version.reason)}</Alert>
            ) : null}
            <p>Version {version?.version ?? "Indisponible"}</p>
            {version?.commit ? <p className="ui-muted">Commit {version.commit}</p> : null}
            {version?.date ? <p className="ui-muted">Date {version.date}</p> : null}
          </section>
          <section className="ntfy-stats">
            <h2>Compteurs</h2>
            {overview.stats.status === "unavailable" ? (
              <Alert tone="warning">{ntfyReasonLabel(overview.stats.reason)}</Alert>
            ) : null}
            <p>{stats ? `${stats.messages} messages` : "Compteurs indisponibles."}</p>
            {stats ? <p>Débit {formatNtfyRate(stats.messagesRate)} msg/s</p> : null}
          </section>
        </>
      ) : null}
    </>
  );
}

function prowlarrReasonLabel(reason: ProwlarrSectionReason | undefined): string {
  switch (reason) {
    case "api-unavailable":
      return "API Prowlarr indisponible.";
    case "permission-denied":
      return "Permission Prowlarr insuffisante.";
    case "timeout":
      return "Délai dépassé vers Prowlarr.";
    case "invalid-response":
      return "Réponse Prowlarr invalide.";
    case "unauthorized":
      return "Clé API Prowlarr invalide.";
    case "rate-limited":
      return "Trop d'actualisations Prowlarr.";
    case "dns":
      return "Le serveur Prowlarr est injoignable (DNS).";
    case "tls":
      return "Erreur TLS vers Prowlarr.";
    case "unreachable":
      return "Le serveur Prowlarr est injoignable.";
    case "unknown":
    case undefined:
      return "Section Prowlarr indisponible.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

async function ProwlarrOverviewPanel({
  id,
  caller,
}: {
  id: string;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  let error: string | null = null;
  let overview: ProwlarrOverview | null = null;
  try {
    overview = await caller.prowlarr.overview.get({ integrationId: id });
  } catch (caught) {
    error = prowlarrUserError(caught);
  }
  const system = overview?.system.data;
  const health = overview?.health.data;
  const indexer = overview?.indexer.data;
  const indexerStatus = overview?.indexerStatus.data;
  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {overview?.status === "degraded" ? (
        <Alert tone="warning">
          Vue Prowlarr partielle : certaines sections sont indisponibles.
        </Alert>
      ) : null}
      {overview ? (
        <>
          <p className="ui-muted">Actualisé {overview.fetchedAt}</p>
          <p className="ui-muted">
            Compteurs uniquement. Aucun nom d&apos;indexeur, aucune URL, aucune mutation. Lecture
            seule.
          </p>
          <section className="prowlarr-system">
            <h2>Système</h2>
            {overview.system.status === "unavailable" ? (
              <Alert tone="warning">{prowlarrReasonLabel(overview.system.reason)}</Alert>
            ) : null}
            <p>Version {system?.version ?? "Indisponible"}</p>
            {system?.appName ? <p className="ui-muted">{system.appName}</p> : null}
          </section>
          <section className="prowlarr-indexer">
            <h2>Indexeurs</h2>
            {overview.indexer.status === "unavailable" ? (
              <Alert tone="warning">{prowlarrReasonLabel(overview.indexer.reason)}</Alert>
            ) : null}
            <p>
              {indexer
                ? `${indexer.count} indexeurs · ${indexer.enabledCount} actifs`
                : "Indexeurs indisponibles."}
            </p>
          </section>
          <section className="prowlarr-indexerstatus">
            <h2>Statuts</h2>
            {overview.indexerStatus.status === "unavailable" ? (
              <Alert tone="warning">{prowlarrReasonLabel(overview.indexerStatus.reason)}</Alert>
            ) : null}
            <p>
              {indexerStatus
                ? `${indexerStatus.count} statuts`
                : "Statuts indexeurs indisponibles."}
            </p>
          </section>
          <section className="prowlarr-health">
            <h2>Santé</h2>
            {overview.health.status === "unavailable" ? (
              <Alert tone="warning">{prowlarrReasonLabel(overview.health.reason)}</Alert>
            ) : null}
            <p>
              {health
                ? `${health.error} erreurs · ${health.warning} avertissements`
                : "Santé indisponible."}
            </p>
          </section>
        </>
      ) : null}
    </>
  );
}

async function ProwlarrIntegrationDetail({
  id,
  metadata,
  caller,
}: {
  id: string;
  metadata: ProwlarrIntegrationMetadata;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  if (!metadata.enabled) {
    return (
      <PageContainer>
        <PageHeader title={metadata.name} description="Prowlarr" />
        <Alert tone="warning">Cette intégration Prowlarr est désactivée.</Alert>
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="Prowlarr" />
      <ProwlarrRefreshButton integrationId={id} />
      <Suspense fallback={<p className="ui-muted">Chargement de Prowlarr…</p>}>
        <ProwlarrOverviewPanel id={id} caller={caller} />
      </Suspense>
    </PageContainer>
  );
}

function qbittorrentReasonLabel(reason: QbittorrentSectionReason | undefined): string {
  switch (reason) {
    case "api-unavailable":
      return "API qBittorrent indisponible.";
    case "permission-denied":
      return "Permission qBittorrent insuffisante.";
    case "timeout":
      return "Délai dépassé vers qBittorrent.";
    case "invalid-response":
      return "Réponse qBittorrent invalide.";
    case "unauthorized":
      return "Identifiants qBittorrent invalides.";
    case "rate-limited":
      return "Trop d'actualisations qBittorrent.";
    case "dns":
      return "Le serveur qBittorrent est injoignable (DNS).";
    case "tls":
      return "Erreur TLS vers qBittorrent.";
    case "unreachable":
      return "Le serveur qBittorrent est injoignable.";
    case "unknown":
    case undefined:
      return "Section qBittorrent indisponible.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

function formatQbittorrentSpeed(bytesPerSecond: number | null | undefined): string {
  if (bytesPerSecond === null || bytesPerSecond === undefined) return "Indisponible";
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} o/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} Kio/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} Mio/s`;
}

function qbittorrentConnectionLabel(
  status: "connected" | "firewalled" | "disconnected" | undefined,
): string {
  switch (status) {
    case "connected":
      return "connecté";
    case "firewalled":
      return "pare-feu";
    case "disconnected":
      return "déconnecté";
    case undefined:
      return "inconnu";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

async function QbittorrentOverviewPanel({
  id,
  caller,
}: {
  id: string;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  let error: string | null = null;
  let overview: QbittorrentOverview | null = null;
  try {
    overview = await caller.qbittorrent.overview.get({ integrationId: id });
  } catch (caught) {
    error = qbittorrentUserError(caught);
  }
  const version = overview?.version.data;
  const transfer = overview?.transfer.data;
  const torrents = overview?.torrents.data;
  const active =
    torrents === null || torrents === undefined ? null : torrents.downloading + torrents.uploading;
  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {overview?.status === "degraded" ? (
        <Alert tone="warning">
          Vue qBittorrent partielle : certaines sections sont indisponibles.
        </Alert>
      ) : null}
      {overview ? (
        <>
          <p className="ui-muted">Actualisé {overview.fetchedAt}</p>
          <p className="ui-muted">
            Compteurs uniquement. Aucun nom de torrent, aucun hash, aucun magnet. Lecture seule.
          </p>
          <section className="qbittorrent-version">
            <h2>Version</h2>
            {overview.version.status === "unavailable" ? (
              <Alert tone="warning">{qbittorrentReasonLabel(overview.version.reason)}</Alert>
            ) : null}
            <p>Version {version?.version ?? "Indisponible"}</p>
          </section>
          <section className="qbittorrent-transfer">
            <h2>Transfert</h2>
            {overview.transfer.status === "unavailable" ? (
              <Alert tone="warning">{qbittorrentReasonLabel(overview.transfer.reason)}</Alert>
            ) : null}
            <p>↓ {formatQbittorrentSpeed(transfer?.downloadSpeedBps)}</p>
            <p>↑ {formatQbittorrentSpeed(transfer?.uploadSpeedBps)}</p>
            {transfer?.connectionStatus ? (
              <p className="ui-muted">
                Connexion {qbittorrentConnectionLabel(transfer.connectionStatus)}
              </p>
            ) : null}
          </section>
          <section className="qbittorrent-torrents">
            <h2>Torrents</h2>
            {overview.torrents.status === "unavailable" ? (
              <Alert tone="warning">{qbittorrentReasonLabel(overview.torrents.reason)}</Alert>
            ) : null}
            <p>
              {torrents && active !== null
                ? `${active} actifs · ${torrents.queued} en file · ${torrents.paused} en pause`
                : "Compteurs torrents indisponibles."}
            </p>
          </section>
        </>
      ) : null}
    </>
  );
}

async function QbittorrentIntegrationDetail({
  id,
  metadata,
  caller,
}: {
  id: string;
  metadata: QbittorrentIntegrationMetadata;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  if (!metadata.enabled) {
    return (
      <PageContainer>
        <PageHeader title={metadata.name} description="qBittorrent" />
        <Alert tone="warning">Cette intégration qBittorrent est désactivée.</Alert>
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="qBittorrent" />
      <QbittorrentRefreshButton integrationId={id} />
      <Suspense fallback={<p className="ui-muted">Chargement de qBittorrent…</p>}>
        <QbittorrentOverviewPanel id={id} caller={caller} />
      </Suspense>
    </PageContainer>
  );
}

function seerrReasonLabel(reason: SeerrSectionReason | undefined): string {
  switch (reason) {
    case "api-unavailable":
      return "API Seerr indisponible.";
    case "permission-denied":
      return "Permission Seerr insuffisante.";
    case "timeout":
      return "Délai dépassé vers Seerr.";
    case "invalid-response":
      return "Réponse Seerr invalide.";
    case "unauthorized":
      return "Clé API Seerr invalide.";
    case "rate-limited":
      return "Trop d'actualisations Seerr.";
    case "dns":
      return "Le serveur Seerr est injoignable (DNS).";
    case "tls":
      return "Erreur TLS vers Seerr.";
    case "unreachable":
      return "Le serveur Seerr est injoignable.";
    case "unknown":
    case undefined:
      return "Section Seerr indisponible.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

async function SeerrOverviewPanel({
  id,
  caller,
}: {
  id: string;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  let error: string | null = null;
  let overview: SeerrOverview | null = null;
  try {
    overview = await caller.seerr.overview.get({ integrationId: id });
  } catch (caught) {
    error = seerrUserError(caught);
  }
  const system = overview?.system.data;
  const counts = overview?.counts.data;
  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {overview?.status === "degraded" ? (
        <Alert tone="warning">Vue Seerr partielle : certaines sections sont indisponibles.</Alert>
      ) : null}
      {overview ? (
        <>
          <p className="ui-muted">Actualisé {overview.fetchedAt}</p>
          <p className="ui-muted">
            Compteurs uniquement. Aucun titre, utilisateur, e-mail ni identifiant TMDB. Lecture
            seule.
          </p>
          <section className="seerr-system">
            <h2>Système</h2>
            {overview.system.status === "unavailable" ? (
              <Alert tone="warning">{seerrReasonLabel(overview.system.reason)}</Alert>
            ) : null}
            <p>Version {system?.version ?? "Indisponible"}</p>
            {system?.compatibleProduct ? (
              <p className="ui-muted">Famille Seerr / Jellyseerr / Overseerr</p>
            ) : null}
          </section>
          <section className="seerr-counts">
            <h2>Demandes</h2>
            {overview.counts.status === "unavailable" ? (
              <Alert tone="warning">{seerrReasonLabel(overview.counts.reason)}</Alert>
            ) : null}
            <p>
              {counts
                ? `${counts.pending} en attente · ${counts.approved} approuvées · ${counts.processing} en cours · ${counts.available} disponibles`
                : "Compteurs indisponibles."}
            </p>
          </section>
        </>
      ) : null}
    </>
  );
}

async function SeerrIntegrationDetail({
  id,
  metadata,
  caller,
}: {
  id: string;
  metadata: SeerrIntegrationMetadata;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  if (!metadata.enabled) {
    return (
      <PageContainer>
        <PageHeader title={metadata.name} description="Seerr" />
        <Alert tone="warning">Cette intégration Seerr est désactivée.</Alert>
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="Seerr" />
      <SeerrRefreshButton integrationId={id} />
      <Suspense fallback={<p className="ui-muted">Chargement de Seerr…</p>}>
        <SeerrOverviewPanel id={id} caller={caller} />
      </Suspense>
    </PageContainer>
  );
}

function radarrReasonLabel(reason: RadarrSectionReason | undefined): string {
  switch (reason) {
    case "api-unavailable":
      return "API Radarr indisponible.";
    case "permission-denied":
      return "Permission Radarr insuffisante.";
    case "timeout":
      return "Délai dépassé vers Radarr.";
    case "invalid-response":
      return "Réponse Radarr invalide.";
    case "unauthorized":
      return "Clé API Radarr invalide.";
    case "rate-limited":
      return "Trop d'actualisations Radarr.";
    case "dns":
      return "Le serveur Radarr est injoignable (DNS).";
    case "tls":
      return "Erreur TLS vers Radarr.";
    case "unreachable":
      return "Le serveur Radarr est injoignable.";
    case "unknown":
    case undefined:
      return "Section Radarr indisponible.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

async function RadarrOverviewPanel({
  id,
  caller,
}: {
  id: string;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  let error: string | null = null;
  let overview: RadarrOverview | null = null;
  try {
    overview = await caller.radarr.overview.get({ integrationId: id });
  } catch (caught) {
    error = radarrUserError(caught);
  }
  const system = overview?.system.data;
  const health = overview?.health.data;
  const queue = overview?.queue.data;
  const movie = overview?.movie.data;
  const diskSpace = overview?.diskSpace.data;
  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {overview?.status === "degraded" ? (
        <Alert tone="warning">Vue Radarr partielle : certaines sections sont indisponibles.</Alert>
      ) : null}
      {overview ? (
        <>
          <p className="ui-muted">Actualisé {overview.fetchedAt}</p>
          <p className="ui-muted">
            Compteurs uniquement. Aucun titre de film, aucun chemin, aucune mutation. Lecture seule.
          </p>
          <section className="radarr-system">
            <h2>Système</h2>
            {overview.system.status === "unavailable" ? (
              <Alert tone="warning">{radarrReasonLabel(overview.system.reason)}</Alert>
            ) : null}
            <p>Version {system?.version ?? "Indisponible"}</p>
            {system?.appName ? <p className="ui-muted">{system.appName}</p> : null}
          </section>
          <section className="radarr-movie">
            <h2>Films</h2>
            {overview.movie.status === "unavailable" ? (
              <Alert tone="warning">{radarrReasonLabel(overview.movie.reason)}</Alert>
            ) : null}
            <p>
              {movie
                ? `${movie.count} films${movie.truncated ? " · liste tronquée" : ""}`
                : "Films indisponibles."}
            </p>
          </section>
          <section className="radarr-queue">
            <h2>File d&apos;attente</h2>
            {overview.queue.status === "unavailable" ? (
              <Alert tone="warning">{radarrReasonLabel(overview.queue.reason)}</Alert>
            ) : null}
            <p>
              {queue?.totalCount !== undefined
                ? `File ${queue.totalCount}`
                : "File d'attente indisponible."}
            </p>
          </section>
          <section className="radarr-health">
            <h2>Santé</h2>
            {overview.health.status === "unavailable" ? (
              <Alert tone="warning">{radarrReasonLabel(overview.health.reason)}</Alert>
            ) : null}
            <p>
              {health
                ? `${health.error} erreurs · ${health.warning} avertissements`
                : "Santé indisponible."}
            </p>
          </section>
          <section className="radarr-diskspace">
            <h2>Espace disque</h2>
            {overview.diskSpace.status === "unavailable" ? (
              <Alert tone="warning">{radarrReasonLabel(overview.diskSpace.reason)}</Alert>
            ) : null}
            <p>
              {diskSpace
                ? `${diskSpace.freeBytes} octets libres / ${diskSpace.totalBytes} octets`
                : "Espace disque indisponible."}
            </p>
          </section>
        </>
      ) : null}
    </>
  );
}

async function RadarrIntegrationDetail({
  id,
  metadata,
  caller,
}: {
  id: string;
  metadata: RadarrIntegrationMetadata;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  if (!metadata.enabled) {
    return (
      <PageContainer>
        <PageHeader title={metadata.name} description="Radarr" />
        <Alert tone="warning">Cette intégration Radarr est désactivée.</Alert>
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="Radarr" />
      <RadarrRefreshButton integrationId={id} />
      <Suspense fallback={<p className="ui-muted">Chargement de Radarr…</p>}>
        <RadarrOverviewPanel id={id} caller={caller} />
      </Suspense>
    </PageContainer>
  );
}

function sonarrReasonLabel(reason: SonarrSectionReason | undefined): string {
  switch (reason) {
    case "api-unavailable":
      return "API Sonarr indisponible.";
    case "permission-denied":
      return "Permission Sonarr insuffisante.";
    case "timeout":
      return "Délai dépassé vers Sonarr.";
    case "invalid-response":
      return "Réponse Sonarr invalide.";
    case "unauthorized":
      return "Clé API Sonarr invalide.";
    case "rate-limited":
      return "Trop d'actualisations Sonarr.";
    case "dns":
      return "Le serveur Sonarr est injoignable (DNS).";
    case "tls":
      return "Erreur TLS vers Sonarr.";
    case "unreachable":
      return "Le serveur Sonarr est injoignable.";
    case "unknown":
    case undefined:
      return "Section Sonarr indisponible.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

async function SonarrOverviewPanel({
  id,
  caller,
}: {
  id: string;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  let error: string | null = null;
  let overview: SonarrOverview | null = null;
  try {
    overview = await caller.sonarr.overview.get({ integrationId: id });
  } catch (caught) {
    error = sonarrUserError(caught);
  }
  const system = overview?.system.data;
  const health = overview?.health.data;
  const queue = overview?.queue.data;
  const series = overview?.series.data;
  const diskSpace = overview?.diskSpace.data;
  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {overview?.status === "degraded" ? (
        <Alert tone="warning">Vue Sonarr partielle : certaines sections sont indisponibles.</Alert>
      ) : null}
      {overview ? (
        <>
          <p className="ui-muted">Actualisé {overview.fetchedAt}</p>
          <p className="ui-muted">
            Compteurs uniquement. Aucun titre de série, aucun chemin, aucune mutation. Lecture
            seule.
          </p>
          <section className="sonarr-system">
            <h2>Système</h2>
            {overview.system.status === "unavailable" ? (
              <Alert tone="warning">{sonarrReasonLabel(overview.system.reason)}</Alert>
            ) : null}
            <p>Version {system?.version ?? "Indisponible"}</p>
            {system?.appName ? <p className="ui-muted">{system.appName}</p> : null}
          </section>
          <section className="sonarr-series">
            <h2>Séries</h2>
            {overview.series.status === "unavailable" ? (
              <Alert tone="warning">{sonarrReasonLabel(overview.series.reason)}</Alert>
            ) : null}
            <p>
              {series
                ? `${series.count} séries${series.truncated ? " · liste tronquée" : ""}`
                : "Séries indisponibles."}
            </p>
          </section>
          <section className="sonarr-queue">
            <h2>File d&apos;attente</h2>
            {overview.queue.status === "unavailable" ? (
              <Alert tone="warning">{sonarrReasonLabel(overview.queue.reason)}</Alert>
            ) : null}
            <p>
              {queue?.totalCount !== undefined
                ? `File ${queue.totalCount}`
                : "File d'attente indisponible."}
            </p>
          </section>
          <section className="sonarr-health">
            <h2>Santé</h2>
            {overview.health.status === "unavailable" ? (
              <Alert tone="warning">{sonarrReasonLabel(overview.health.reason)}</Alert>
            ) : null}
            <p>
              {health
                ? `${health.error} erreurs · ${health.warning} avertissements`
                : "Santé indisponible."}
            </p>
          </section>
          <section className="sonarr-diskspace">
            <h2>Espace disque</h2>
            {overview.diskSpace.status === "unavailable" ? (
              <Alert tone="warning">{sonarrReasonLabel(overview.diskSpace.reason)}</Alert>
            ) : null}
            <p>
              {diskSpace
                ? `${diskSpace.freeBytes} octets libres / ${diskSpace.totalBytes} octets`
                : "Espace disque indisponible."}
            </p>
          </section>
        </>
      ) : null}
    </>
  );
}

async function SonarrIntegrationDetail({
  id,
  metadata,
  caller,
}: {
  id: string;
  metadata: SonarrIntegrationMetadata;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  if (!metadata.enabled) {
    return (
      <PageContainer>
        <PageHeader title={metadata.name} description="Sonarr" />
        <Alert tone="warning">Cette intégration Sonarr est désactivée.</Alert>
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="Sonarr" />
      <SonarrRefreshButton integrationId={id} />
      <Suspense fallback={<p className="ui-muted">Chargement de Sonarr…</p>}>
        <SonarrOverviewPanel id={id} caller={caller} />
      </Suspense>
    </PageContainer>
  );
}

async function NtfyIntegrationDetail({
  id,
  metadata,
  caller,
}: {
  id: string;
  metadata: NtfyIntegrationMetadata;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  if (!metadata.enabled) {
    return (
      <PageContainer>
        <PageHeader title={metadata.name} description="ntfy" />
        <Alert tone="warning">Cette intégration ntfy est désactivée.</Alert>
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="ntfy" />
      <NtfyRefreshButton integrationId={id} />
      <Suspense fallback={<p className="ui-muted">Chargement de ntfy…</p>}>
        <NtfyOverviewPanel id={id} caller={caller} />
      </Suspense>
    </PageContainer>
  );
}

async function GrafanaIntegrationDetail({
  id,
  metadata,
  caller,
}: {
  id: string;
  metadata: GrafanaIntegrationMetadata;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  if (!metadata.enabled) {
    return (
      <PageContainer>
        <PageHeader title={metadata.name} description="Grafana" />
        <Alert tone="warning">Cette intégration Grafana est désactivée.</Alert>
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="Grafana" />
      <GrafanaRefreshButton integrationId={id} />
      <Suspense fallback={<p className="ui-muted">Chargement de Grafana…</p>}>
        <GrafanaOverviewPanel id={id} caller={caller} />
      </Suspense>
    </PageContainer>
  );
}

function formatPrometheusValue(value: number | null): string {
  if (value === null) return "Indisponible";
  if (Number.isInteger(value)) return String(value);
  return value.toPrecision(6);
}

function prometheusSeriesName(labels: Readonly<Record<string, string>>): string {
  return labels.__name__ ?? labels.job ?? labels.instance ?? "metric";
}

async function PrometheusOverviewPanel({
  id,
  caller,
}: {
  id: string;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  let error: string | null = null;
  let overview: PrometheusQueryDto | null = null;
  try {
    overview = await caller.prometheus.overview.get({ integrationId: id });
  } catch (caught) {
    error = prometheusUserError(caught);
  }
  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {overview?.status === "degraded" ? (
        <Alert tone="warning">Vue Prometheus partielle : la liste de séries est tronquée.</Alert>
      ) : null}
      {overview ? (
        <>
          <p className="ui-muted">Actualisé {overview.fetchedAt}</p>
          <p className="ui-muted">
            Requête serveur fixe <code>up</code>. Le navigateur n&apos;envoie jamais de PromQL.
          </p>
          <section className="prometheus-summary">
            <h2>État</h2>
            <p>{overview.status === "available" ? "Disponible" : "Dégradé"}</p>
            <p>
              {overview.seriesCount} série{overview.seriesCount === 1 ? "" : "s"}
              {overview.truncated ? " · liste tronquée" : ""}
            </p>
            <p>
              {overview.sampleCount} échantillon{overview.sampleCount === 1 ? "" : "s"}
            </p>
          </section>
          <section className="prometheus-series">
            <h2>Séries</h2>
            {overview.series.length ? (
              <ul className="prometheus-series-list">
                {overview.series.map((series, index) => {
                  const last = [...series.points]
                    .reverse()
                    .find((point) => point.value !== null && Number.isFinite(point.value));
                  return (
                    <li
                      key={`${prometheusSeriesName(series.labels)}-${index}`}
                      className="prometheus-series-card"
                    >
                      <p>
                        <strong>{prometheusSeriesName(series.labels)}</strong>
                      </p>
                      {series.labels.job ? <p>job {series.labels.job}</p> : null}
                      {series.labels.instance ? <p>instance {series.labels.instance}</p> : null}
                      <p>Valeur {formatPrometheusValue(last?.value ?? null)}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="ui-muted">Aucune série Prometheus.</p>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

async function PrometheusIntegrationDetail({
  id,
  metadata,
  caller,
}: {
  id: string;
  metadata: PrometheusIntegrationMetadata;
  caller: Awaited<ReturnType<typeof getBoardCaller>>;
}) {
  if (!metadata.enabled) {
    return (
      <PageContainer>
        <PageHeader title={metadata.name} description="Prometheus" />
        <Alert tone="warning">Cette intégration Prometheus est désactivée.</Alert>
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader title={metadata.name} description="Prometheus" />
      <PrometheusRefreshButton integrationId={id} />
      <Suspense fallback={<p className="ui-muted">Chargement de Prometheus…</p>}>
        <PrometheusOverviewPanel id={id} caller={caller} />
      </Suspense>
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
      case "jellyfin":
        return <JellyfinIntegrationDetail id={id} metadata={detail.metadata} caller={caller} />;
      case "immich":
        return <ImmichIntegrationDetail id={id} metadata={detail.metadata} caller={caller} />;
      case "beszel":
        return <BeszelIntegrationDetail id={id} metadata={detail.metadata} caller={caller} />;
      case "prometheus":
        return <PrometheusIntegrationDetail id={id} metadata={detail.metadata} caller={caller} />;
      case "uptime-kuma":
        return <UptimeKumaIntegrationDetail id={id} metadata={detail.metadata} caller={caller} />;
      case "proxmox":
        return <ProxmoxIntegrationDetail id={id} metadata={detail.metadata} caller={caller} />;
      case "grafana":
        return <GrafanaIntegrationDetail id={id} metadata={detail.metadata} caller={caller} />;
      case "ntfy":
        return <NtfyIntegrationDetail id={id} metadata={detail.metadata} caller={caller} />;
      case "prowlarr":
        return <ProwlarrIntegrationDetail id={id} metadata={detail.metadata} caller={caller} />;
      case "qbittorrent":
        return <QbittorrentIntegrationDetail id={id} metadata={detail.metadata} caller={caller} />;
      case "seerr":
        return <SeerrIntegrationDetail id={id} metadata={detail.metadata} caller={caller} />;
      case "radarr":
        return <RadarrIntegrationDetail id={id} metadata={detail.metadata} caller={caller} />;
      case "sonarr":
        return <SonarrIntegrationDetail id={id} metadata={detail.metadata} caller={caller} />;
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
