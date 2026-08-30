import Link from "next/link";
import { redirect } from "next/navigation";
import type { DockerIntegrationMetadata } from "@dashboard/docker";
import type { IntegrationDto } from "@dashboard/integrations";
import { Alert, Badge, PageContainer, PageHeader } from "@dashboard/ui";
import { AppIcon } from "../../apps/app-icon";
import { getBoardCaller } from "../../../lib/server/board-api";
import { dockerUserError } from "../docker-error";
import { resolveIntegrationDetail } from "../resolve-integration-detail";

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
  if (integration.type === "docker") redirect("/forbidden");
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
