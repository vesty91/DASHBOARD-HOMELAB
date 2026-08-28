import { redirect } from "next/navigation";
import { getBoardCaller } from "../../../../lib/server/board-api";
import { setIntegrationSecretAction, updateIntegrationAction } from "../../actions";
import { IntegrationForm } from "../../integration-form";
import { SecretFieldControl } from "../../secret-field-control";

export default async function EditIntegrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caller = await getBoardCaller();
  if (!(await caller.integration.canManage())) redirect("/forbidden");
  const [integration, catalog] = await Promise.all([
    caller.integration.get({ id }),
    caller.integration.catalog(),
  ]);
  const definition = catalog.find((entry) => entry.id === integration.type);
  return (
    <main>
      <h1>Modifier {integration.name}</h1>
      {integration.config.verifyTls === false && (
        <p role="alert">Vérification TLS désactivée pour cette intégration.</p>
      )}
      {definition ? (
        <>
          <IntegrationForm
            integration={integration}
            catalog={catalog}
            action={updateIntegrationAction.bind(null, id)}
          />
          {definition.secretFields.map((field) => (
            <SecretFieldControl
              key={field.key}
              fieldKey={field.key}
              label={field.label}
              configured={Boolean(integration.secrets[field.key]?.configured)}
              action={setIntegrationSecretAction.bind(null, id)}
            />
          ))}
        </>
      ) : (
        <p>
          Définition indisponible. La configuration dépendante du type ne peut pas être modifiée.
        </p>
      )}
    </main>
  );
}
