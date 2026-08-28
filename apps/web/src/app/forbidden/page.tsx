import Link from "next/link";
import { PublicAuthLayout } from "@/components/public-auth-layout";

export default function ForbiddenPage() {
  return (
    <PublicAuthLayout
      title="Accès interdit"
      description="Vous n'avez pas l'autorisation d'accéder à cette page."
    >
      <Link className="ui-btn ui-btn-primary" href="/">
        Retour à l'accueil
      </Link>
    </PublicAuthLayout>
  );
}
