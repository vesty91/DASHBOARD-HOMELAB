import { PublicAuthLayout } from "@/components/public-auth-layout";
import { getBoardCaller } from "@/lib/server/board-api";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; password?: string }>;
}) {
  const params = await searchParams;
  const config = await (await getBoardCaller()).oidc.publicConfig();
  return (
    <PublicAuthLayout title="Connexion" description="Accédez à votre dashboard Restor_Pc.">
      <LoginForm
        oidcEnabled={config.enabled}
        oidcDisplayName={config.displayName}
        allowLocalLogin={config.allowLocalLogin}
        {...(params.error ? { errorCode: params.error } : {})}
        passwordChanged={params.password === "changed"}
      />
    </PublicAuthLayout>
  );
}
