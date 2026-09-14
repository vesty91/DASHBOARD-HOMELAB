import { Button, Field, Input, PageContainer, PageHeader, Select } from "@dashboard/ui";
import { requireAdminPagePermission } from "@/lib/server/auth";
import { getBoardCaller } from "@/lib/server/board-api";
import { saveOidcMappingsAction, saveOidcSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function OidcAdminPage() {
  await requireAdminPagePermission("oidc.manage");
  const caller = await getBoardCaller();
  const [settings, mappings, groups] = await Promise.all([
    caller.oidc.getSettings(),
    caller.oidc.listMappings(),
    caller.oidc.listGroups(),
  ]);
  return (
    <PageContainer>
      <PageHeader
        title="OpenID Connect"
        description="Provider OIDC générique, association d'identités et mapping de groupes default-deny."
      />
      <form action={saveOidcSettingsAction} className="ui-form ui-card ui-form-card ui-form-grid">
        <h2 className="ui-section-title">Configuration</h2>
        <Field label="Activer OIDC">
          <Input name="enabled" type="checkbox" defaultChecked={settings.enabled} />
        </Field>
        <Field label="Nom affiché">
          <Input name="displayName" defaultValue={settings.displayName ?? ""} />
        </Field>
        <Field label="Issuer URL">
          <Input
            name="issuer"
            type="url"
            placeholder="https://auth.example/application/o/dashboard/"
            defaultValue={settings.issuer ?? ""}
          />
        </Field>
        <Field label="Client ID">
          <Input name="clientId" defaultValue={settings.clientId ?? ""} />
        </Field>
        <Field
          label="Client secret"
          hint={
            settings.hasClientSecret
              ? "Un secret chiffré est déjà stocké. Laissez vide pour le conserver."
              : "Stocké chiffré au repos. Jamais renvoyé au navigateur."
          }
        >
          <Input name="clientSecret" type="password" autoComplete="new-password" />
        </Field>
        <Field label="Redirect URI">
          <Input
            name="redirectUri"
            type="url"
            defaultValue={settings.redirectUri ?? ""}
            placeholder="https://dashboard.example/api/auth/callback/oidc"
          />
        </Field>
        <Field label="Scopes">
          <Input name="scopes" defaultValue={settings.scopes} />
        </Field>
        <Field label="Claim des groupes">
          <Input name="groupClaim" defaultValue={settings.groupClaim} />
        </Field>
        <Field label="Autoriser le login local">
          <Input name="allowLocalLogin" type="checkbox" defaultChecked={settings.allowLocalLogin} />
        </Field>
        <Field
          label="Associer par email vérifié"
          hint="Uniquement si l'email OIDC est vérifié. Désactivé par défaut pour éviter un account takeover."
        >
          <Input
            name="autoLinkVerifiedEmail"
            type="checkbox"
            defaultChecked={settings.autoLinkVerifiedEmail}
          />
        </Field>
        <Field
          label="Provisionner un compte USER"
          hint="Jamais SYSTEM_ADMIN. Sans mapping, le compte n'obtient que les permissions USER."
        >
          <Input name="autoProvision" type="checkbox" defaultChecked={settings.autoProvision} />
        </Field>
        <Button variant="primary" type="submit">
          Enregistrer
        </Button>
      </form>
      <form action={saveOidcMappingsAction} className="ui-form ui-card ui-form-card">
        <h2 className="ui-section-title">Mapping de groupes</h2>
        <p className="ui-muted">
          Default-deny : un groupe OIDC inconnu n'accorde aucune permission locale.
        </p>
        {(mappings.length > 0 ? mappings : [{ oidcGroup: "", localGroupId: "" }]).map(
          (mapping, index) => (
            <div className="ui-form-grid" key={`${mapping.oidcGroup}-${index}`}>
              <Field label="Groupe OIDC">
                <Input name="oidcGroup" defaultValue={mapping.oidcGroup} />
              </Field>
              <Field label="Groupe local">
                <Select name="localGroupId" defaultValue={mapping.localGroupId}>
                  <option value="">—</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ),
        )}
        <div className="ui-form-grid">
          <Field label="Groupe OIDC supplémentaire">
            <Input name="oidcGroup" />
          </Field>
          <Field label="Groupe local supplémentaire">
            <Select name="localGroupId" defaultValue="">
              <option value="">—</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button variant="primary" type="submit">
          Enregistrer les mappings
        </Button>
      </form>
    </PageContainer>
  );
}
