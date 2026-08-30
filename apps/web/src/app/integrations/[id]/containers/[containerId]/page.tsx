import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Badge, PageContainer, PageHeader } from "@dashboard/ui";
import { AppIcon } from "../../../../apps/app-icon";
import { getBoardCaller } from "../../../../../lib/server/board-api";
import { DockerContainerActions } from "../../../docker-container-actions";
import { dockerUserError } from "../../../docker-error";
import { DockerLogsPanel } from "../../../docker-logs-panel";

function metric(value: number | null, suffix = ""): string {
  return value === null ? "Indisponible" : `${value}${suffix}`;
}

function formatBytes(value: number | null): string {
  if (value === null) return "Indisponible";
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} Kio`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mio`;
}

export default async function DockerContainerPage({
  params,
}: {
  params: Promise<{ id: string; containerId: string }>;
}) {
  const { id, containerId } = await params;
  if (!/^[a-f0-9]{64}$/u.test(containerId)) redirect(`/integrations/${id}`);
  try {
    const caller = await getBoardCaller();
    const permissions = await caller.docker.permissions();
    if (!permissions.canRead) redirect("/forbidden");
    let error: string | null = null;
    let statsError: string | null = null;
    let detail: Awaited<ReturnType<typeof caller.docker.containers.get>> | null = null;
    let stats: Awaited<ReturnType<typeof caller.docker.containers.stats>> | null = null;
    try {
      detail = await caller.docker.containers.get({ integrationId: id, containerId });
    } catch (caught) {
      error = dockerUserError(caught);
    }
    if (detail) {
      try {
        stats = await caller.docker.containers.stats({ integrationId: id, containerId });
      } catch (caught) {
        statsError = dockerUserError(caught);
      }
    }
    return (
      <PageContainer>
        <PageHeader
          title={detail?.name ?? "Conteneur"}
          description="Détail Docker"
          actions={
            <Link className="ui-btn" href={`/integrations/${id}`}>
              Retour
            </Link>
          }
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {detail ? (
          <>
            <section className="docker-detail">
              <AppIcon
                src={detail.recognizedApp?.iconPath}
                name={detail.recognizedApp?.name ?? detail.name}
              />
              <div>
                <p>{detail.image}</p>
                <p>
                  <Badge>{detail.state}</Badge>{" "}
                  <Badge>{detail.health === "none" ? "Pas de healthcheck" : detail.health}</Badge>
                </p>
                <p className="ui-muted">
                  Uptime{" "}
                  {detail.uptimeSeconds === null ? "Indisponible" : `${detail.uptimeSeconds}s`} ·
                  redémarrages {detail.restartCount === null ? "Indisponible" : detail.restartCount}
                </p>
                {detail.recognizedApp ? (
                  <p>
                    Reconnu : {detail.recognizedApp.name}
                    {detail.recognizedApp.replacedByName
                      ? ` · Remplacé par ${detail.recognizedApp.replacedByName}`
                      : ""}
                  </p>
                ) : null}
                {detail.recognizedApp ? (
                  <Link className="ui-btn" href={`/apps/new?template=${detail.recognizedApp.id}`}>
                    Ajouter aux applications
                  </Link>
                ) : null}
              </div>
            </section>
            <section className="docker-stats">
              <h2>Métriques</h2>
              {statsError ? <Alert tone="warning">{statsError}</Alert> : null}
              <ul>
                <li>
                  CPU{" "}
                  {stats
                    ? metric(
                        stats.cpuPercent === null ? null : Number(stats.cpuPercent.toFixed(1)),
                        " %",
                      )
                    : "Indisponible"}
                </li>
                <li>RAM {stats ? formatBytes(stats.memoryUsageBytes) : "Indisponible"}</li>
                <li>
                  RAM %{" "}
                  {stats
                    ? metric(
                        stats.memoryPercent === null
                          ? null
                          : Number(stats.memoryPercent.toFixed(1)),
                        " %",
                      )
                    : "Indisponible"}
                </li>
                <li>Réseau RX {stats ? formatBytes(stats.networkRxBytes) : "Indisponible"}</li>
                <li>Réseau TX {stats ? formatBytes(stats.networkTxBytes) : "Indisponible"}</li>
                <li>Disque lecture {stats ? formatBytes(stats.blockReadBytes) : "Indisponible"}</li>
                <li>
                  Disque écriture {stats ? formatBytes(stats.blockWriteBytes) : "Indisponible"}
                </li>
              </ul>
            </section>
            <DockerContainerActions
              integrationId={id}
              containerId={containerId}
              name={detail.name}
              state={detail.state}
              canStart={permissions.canStart}
              canStop={permissions.canStop}
              canRestart={permissions.canRestart}
            />
            {permissions.canLogs ? (
              <DockerLogsPanel integrationId={id} containerId={containerId} />
            ) : (
              <p className="ui-muted">Logs non autorisés.</p>
            )}
          </>
        ) : null}
      </PageContainer>
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "UNAUTHORIZED")
      redirect("/login");
    if (error && typeof error === "object" && "code" in error && error.code === "FORBIDDEN")
      redirect("/forbidden");
    throw error;
  }
}
