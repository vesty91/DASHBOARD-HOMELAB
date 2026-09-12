import Link from "next/link";
import { redirect } from "next/navigation";
import { Plug } from "lucide-react";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardFooter,
  EmptyState,
  PageContainer,
  PageHeader,
} from "@dashboard/ui";
import { getBoardCaller } from "../../lib/server/board-api";
import { deleteIntegrationAction, testIntegrationAction } from "./actions";
import { DeleteIntegrationControl } from "./delete-integration-control";

const labels = {
  unknown: "Non vérifié",
  available: "Disponible",
  unavailable: "Indisponible",
} as const;

const tones = {
  unknown: "neutral",
  available: "success",
  unavailable: "danger",
} as const;

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  try {
    const caller = await getBoardCaller();
    const { cursor } = await searchParams;
    const [page, canManage, canCreate, catalog, dockerPermissions, synologyPermissions] =
      await Promise.all([
        caller.integration.list({ limit: 50, cursor }),
        caller.integration.canManage(),
        caller.integration.canCreate(),
        caller.integration.catalog(),
        caller.docker.permissions(),
        caller.synology.permissions(),
      ]);
    const canAdd = canCreate && catalog.length > 0;
    return (
      <PageContainer>
        <PageHeader
          title="Intégrations"
          description="Connexions vers les services externes."
          {...(canAdd
            ? {
                actions: (
                  <Link className="ui-btn ui-btn-primary" href="/integrations/new">
                    Ajouter une intégration
                  </Link>
                ),
              }
            : {})}
        />
        {page.items.length === 0 ? (
          <EmptyState
            icon={<Plug />}
            title="Aucune intégration disponible"
            description={
              catalog.length === 0
                ? "Aucun type d'intégration disponible. Les connecteurs seront proposés ici lorsqu'ils seront disponibles."
                : "Ajoutez une intégration Docker ou Synology DSM."
            }
          />
        ) : (
          <section className="card-grid">
            {page.items.map((integration) => (
              <Card key={integration.id}>
                <CardBody>
                  <div className="ui-card-header" style={{ padding: 0 }}>
                    <h2 className="ui-card-title">{integration.name}</h2>
                    <Badge tone={tones[integration.status]}>{labels[integration.status]}</Badge>
                  </div>
                  <p className="ui-muted">
                    {integration.type} — {integration.enabled ? "activée" : "désactivée"}
                    {integration.lastCheckedAt
                      ? ` — dernier test ${integration.lastCheckedAt.toLocaleString("fr-FR")}`
                      : ""}
                  </p>
                  <p className="ui-muted">
                    {integration.definitionAvailable
                      ? "Définition disponible"
                      : "Définition indisponible"}
                  </p>
                  {integration.config.verifyTls === false ? (
                    <Alert tone="warning">
                      Vérification TLS désactivée pour cette intégration.
                    </Alert>
                  ) : null}
                </CardBody>
                <CardFooter>
                  {(integration.type === "docker" && dockerPermissions.canRead) ||
                  (integration.type === "synology" && synologyPermissions.canRead) ? (
                    <Link
                      className="ui-btn ui-btn-primary"
                      href={`/integrations/${integration.id}`}
                    >
                      Ouvrir
                    </Link>
                  ) : null}
                  {canManage && integration.definitionAvailable ? (
                    <>
                      <Link
                        className="ui-btn ui-btn-ghost"
                        href={`/integrations/${integration.id}/edit`}
                      >
                        Modifier
                      </Link>
                      <form action={testIntegrationAction.bind(null, integration.id)}>
                        <button type="submit">Tester la connexion</button>
                      </form>
                      <DeleteIntegrationControl
                        action={deleteIntegrationAction.bind(null, integration.id)}
                      />
                    </>
                  ) : null}
                  {canManage && !integration.definitionAvailable ? (
                    <DeleteIntegrationControl
                      action={deleteIntegrationAction.bind(null, integration.id)}
                    />
                  ) : null}
                </CardFooter>
              </Card>
            ))}
          </section>
        )}
        {page.nextCursor ? (
          <p style={{ marginTop: "1rem" }}>
            <Link href={`/integrations?cursor=${page.nextCursor}`}>Page suivante</Link>
          </p>
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
