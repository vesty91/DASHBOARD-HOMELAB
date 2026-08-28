import Link from "next/link";
import { redirect } from "next/navigation";
import { getBoardCaller } from "../../lib/server/board-api";
import { deleteIntegrationAction, testIntegrationAction } from "./actions";
import { DeleteIntegrationControl } from "./delete-integration-control";

const labels = {
  unknown: "Non vérifié",
  available: "Disponible",
  unavailable: "Indisponible",
} as const;

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  try {
    const caller = await getBoardCaller();
    const { cursor } = await searchParams;
    const [page, canManage, canCreate, catalog] = await Promise.all([
      caller.integration.list({ limit: 50, cursor }),
      caller.integration.canManage(),
      caller.integration.canCreate(),
      caller.integration.catalog(),
    ]);
    const canAdd = canCreate && catalog.length > 0;
    return (
      <main>
        <h1>Intégrations</h1>
        {canAdd ? (
          <Link href="/integrations/new">Ajouter une intégration</Link>
        ) : canCreate ? (
          <p>Aucun type d&apos;intégration disponible.</p>
        ) : null}
        {catalog.length === 0 && (
          <p>
            Les adapters d&apos;intégration arriveront à la Phase 8. Aucun type n&apos;est
            enregistré.
          </p>
        )}
        {page.items.length === 0 ? (
          <p>Aucune intégration.</p>
        ) : (
          <ul>
            {page.items.map((integration) => (
              <li key={integration.id}>
                <article>
                  <h2>{integration.name}</h2>
                  <p>
                    {integration.type} — {integration.enabled ? "activée" : "désactivée"} —{" "}
                    {labels[integration.status]}
                    {integration.lastCheckedAt &&
                      ` — dernier test ${integration.lastCheckedAt.toLocaleString("fr-FR")}`}
                  </p>
                  <p>
                    {integration.definitionAvailable
                      ? "Définition disponible"
                      : "Définition indisponible"}
                  </p>
                  {integration.config.verifyTls === false && (
                    <p role="alert">Vérification TLS désactivée pour cette intégration.</p>
                  )}
                  {canManage && integration.definitionAvailable && (
                    <>
                      <Link href={`/integrations/${integration.id}/edit`}>Modifier</Link>
                      <form action={testIntegrationAction.bind(null, integration.id)}>
                        <button type="submit">Tester la connexion</button>
                      </form>
                      <DeleteIntegrationControl
                        action={deleteIntegrationAction.bind(null, integration.id)}
                      />
                    </>
                  )}
                  {canManage && !integration.definitionAvailable && (
                    <DeleteIntegrationControl
                      action={deleteIntegrationAction.bind(null, integration.id)}
                    />
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}
        {page.nextCursor && (
          <Link href={`/integrations?cursor=${page.nextCursor}`}>Page suivante</Link>
        )}
      </main>
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "UNAUTHORIZED")
      redirect("/login");
    if (error && typeof error === "object" && "code" in error && error.code === "FORBIDDEN")
      redirect("/forbidden");
    throw error;
  }
}
