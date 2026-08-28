import { redirect } from "next/navigation";
import { Button, Field, Input } from "@dashboard/ui";
import { PublicAuthLayout } from "@/components/public-auth-layout";
import { getDatabase } from "@/lib/server/database";
import { setupAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const { authStore } = await getDatabase();
  if (await authStore.isOnboardingCompleted()) redirect("/login");
  return (
    <PublicAuthLayout
      title="Créer le premier administrateur"
      description="Initialisez l'instance : ce compte pourra gérer les utilisateurs, les boards et les applications."
    >
      <form action={setupAction} className="ui-form">
        <Field label="Identifiant">
          <Input required minLength={3} maxLength={64} name="username" autoComplete="username" />
        </Field>
        <Field label="Nom affiché">
          <Input maxLength={100} name="displayName" autoComplete="nickname" />
        </Field>
        <Field label="Mot de passe">
          <Input
            required
            minLength={12}
            maxLength={256}
            type="password"
            name="password"
            autoComplete="new-password"
          />
        </Field>
        <Button variant="primary" type="submit">
          Initialiser
        </Button>
      </form>
    </PublicAuthLayout>
  );
}
