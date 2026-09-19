import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PublicAuthLayout } from "@/components/public-auth-layout";
import { getBoardCaller } from "@/lib/server/board-api";
import { hasCredentialQueryLeak } from "./login-credentials-form";
import { LoginForm } from "./login-form";

async function readCsrfToken(): Promise<string> {
  const store = await cookies();
  const raw =
    store.get("next-auth.csrf-token")?.value ?? store.get("__Host-next-auth.csrf-token")?.value;
  if (!raw) return "";
  const token = decodeURIComponent(raw).split("|")[0]?.trim();
  return token ?? "";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; password?: string; username?: string }>;
}) {
  const params = await searchParams;
  if (hasCredentialQueryLeak(params)) redirect("/login");

  const [config, csrfToken] = await Promise.all([
    (await getBoardCaller()).oidc.publicConfig(),
    readCsrfToken(),
  ]);
  return (
    <PublicAuthLayout title="Connexion" description="Accédez à votre dashboard Restor_Pc.">
      <LoginForm
        oidcEnabled={config.enabled}
        oidcDisplayName={config.displayName}
        allowLocalLogin={config.allowLocalLogin}
        csrfToken={csrfToken}
        {...(params.error ? { errorCode: params.error } : {})}
        passwordChanged={params.password === "changed"}
      />
    </PublicAuthLayout>
  );
}
