import { redirect } from "next/navigation";
import { Button, Field, Input, PageContainer, PageHeader } from "@dashboard/ui";
import { requireSession } from "@/lib/server/auth";
import { changePasswordAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  if (!(await requireSession().catch(() => null))) redirect("/login");
  return (
    <PageContainer>
      <PageHeader
        title="Sécurité du compte"
        description="Modifier le mot de passe de votre compte local."
      />
      <form action={changePasswordAction} className="ui-form">
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
    </PageContainer>
  );
}
