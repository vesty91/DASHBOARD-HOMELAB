import { redirect } from "next/navigation";
import { Button, Field, Input, PageContainer, PageHeader } from "@dashboard/ui";
import { requireSession } from "@/lib/server/auth";
import { getBoardCaller } from "@/lib/server/board-api";
import { changePasswordAction } from "./actions";
import { PushPreferencesPanel } from "./push-preferences-panel";
import { SessionsPanel } from "./sessions-panel";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  if (!(await requireSession().catch(() => null))) redirect("/login");
  const sessions = await (await getBoardCaller()).session.listSelf();
  return (
    <PageContainer>
      <PageHeader
        title="Sécurité du compte"
        description="Mot de passe local, sessions actives et notifications push."
      />
      <form action={changePasswordAction} className="ui-form ui-card ui-form-card">
        <h2 className="ui-section-title">Mot de passe</h2>
        <Field label="Mot de passe actuel">
          <Input required type="password" name="currentPassword" autoComplete="current-password" />
        </Field>
        <Field label="Nouveau mot de passe">
          <Input
            required
            minLength={12}
            maxLength={256}
            type="password"
            name="newPassword"
            autoComplete="new-password"
          />
        </Field>
        <Button variant="primary" type="submit">
          Changer le mot de passe
        </Button>
      </form>
      <SessionsPanel sessions={sessions} />
      <PushPreferencesPanel />
    </PageContainer>
  );
}
