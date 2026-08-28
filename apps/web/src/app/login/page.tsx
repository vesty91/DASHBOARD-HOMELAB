import { PublicAuthLayout } from "@/components/public-auth-layout";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <PublicAuthLayout title="Connexion" description="Accédez à votre tableau de bord homelab.">
      <LoginForm />
    </PublicAuthLayout>
  );
}
