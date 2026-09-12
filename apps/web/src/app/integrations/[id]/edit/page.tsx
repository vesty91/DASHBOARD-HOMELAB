import { redirect } from "next/navigation";
import { Alert, PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "../../../../lib/server/board-api";
import { setIntegrationSecretAction, updateIntegrationAction } from "../../actions";
import { IntegrationForm } from "../../integration-form";
import { SecretFieldControl } from "../../secret-field-control";
import { SynologyDeviceControl } from "../../synology-device-control";

export default async function EditIntegrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caller = await getBoardCaller();
  if (!(await caller.integration.canManage())) redirect("/forbidden");
  const [integration, catalog, synologyPermissions] = await Promise.all([
    caller.integration.get({ id }),
    caller.integration.catalog(),
    caller.synology.permissions(),
  ]);
  const definition = catalog.find((entry) => entry.id === integration.type);
  const secretFields = (definition?.secretFields ?? []).filter((field) => !field.serverManaged);
  return (
    <PageContainer>
      <PageHeader title={`Modifier ${integration.name}`} />
      {integration.config.verifyTls === false ? (
        <Alert tone="warning">Vérification TLS désactivée pour cette intégration.</Alert>
      ) : null}
      {definition ? (
        <>
          <IntegrationForm
            integration={integration}
            catalog={catalog}
            action={updateIntegrationAction.bind(null, id)}
          />
          {secretFields.map((field) => (
            <SecretFieldControl
              key={field.key}
              fieldKey={field.key}
              label={field.label}
              configured={Boolean(integration.secrets[field.key]?.configured)}
              action={setIntegrationSecretAction.bind(null, id)}
            />
          ))}
          {integration.type === "synology" && synologyPermissions.canManageAuth ? (
            <SynologyDeviceControl
              integrationId={id}
              deviceConfigured={Boolean(integration.secrets.deviceId?.configured)}
            />
          ) : null}
        </>
      ) : (
        <p>
          Définition indisponible. La configuration dépendante du type ne peut pas être modifiée.
        </p>
      )}
    </PageContainer>
  );
}
