import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity } from "lucide-react";
import { Badge, EmptyState, PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "@/lib/server/board-api";
import { PUBLIC_STATUS_LABELS, PUBLIC_STATUS_TONES, VISIBILITY_LABELS } from "./labels";

export const dynamic = "force-dynamic";

export default async function StatusPagesListPage() {
  const caller = await getBoardCaller();
  const permissions = await caller.statusPage.permissions();
  if (!permissions.canRead) redirect("/forbidden");

  const pages = await caller.statusPage.list();

  return (
    <PageContainer>
      <PageHeader
        title="Status pages"
        description="Pages de statut publiques opt-in, sans fuite d’URL ni d’identifiants d’intégration."
        {...(permissions.canManage
          ? {
              actions: (
                <Link className="ui-btn ui-btn-primary" href="/status-pages/new">
                  Nouvelle status page
                </Link>
              ),
            }
          : {})}
      />
      {pages.length === 0 ? (
        <EmptyState
          icon={<Activity />}
          title="Aucune status page"
          description={
            permissions.canManage
              ? "Créez une page privée par défaut, ajoutez des services, puis publiez-la si besoin."
              : "Aucune page n’est disponible pour le moment."
          }
        />
      ) : (
        <div className="ui-table-wrap">
          <table className="ui-table" data-testid="status-pages-table">
            <thead>
              <tr>
                <th scope="col">Nom</th>
                <th scope="col">Slug</th>
                <th scope="col">Visibilité</th>
                <th scope="col">État</th>
                <th scope="col">Statut global</th>
                <th scope="col">Services</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => (
                <tr key={page.id} data-testid={`status-page-row-${page.id}`}>
                  <td>
                    <Link href={`/status-pages/${page.id}`}>{page.name}</Link>
                  </td>
                  <td>
                    <code>{page.slug}</code>
                  </td>
                  <td>{VISIBILITY_LABELS[page.visibility]}</td>
                  <td>
                    <Badge tone={page.enabled ? "success" : "neutral"}>
                      {page.enabled ? "Activée" : "Désactivée"}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={PUBLIC_STATUS_TONES[page.overallStatus]}>
                      {PUBLIC_STATUS_LABELS[page.overallStatus]}
                    </Badge>
                  </td>
                  <td>{page.services.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}
