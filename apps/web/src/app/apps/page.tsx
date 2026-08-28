import Link from "next/link";
import { redirect } from "next/navigation";
import { AppWindow } from "lucide-react";
import {
  Badge,
  Card,
  CardBody,
  CardFooter,
  EmptyState,
  PageContainer,
  PageHeader,
} from "@dashboard/ui";
import { getBoardCaller } from "../../lib/server/board-api";
import { deleteAppAction, testAppAction } from "./actions";
import { DeleteAppControl } from "./delete-app-control";
import { AppIcon } from "./app-icon";

const labels = {
  unknown: "Non vérifié",
  up: "Disponible",
  down: "Indisponible",
  timeout: "Timeout",
  error: "Erreur",
} as const;

const tones = {
  unknown: "neutral",
  up: "success",
  down: "danger",
  timeout: "warning",
  error: "danger",
} as const;

export default async function AppsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  try {
    const caller = await getBoardCaller();
    const { cursor } = await searchParams;
    const [page, canManage] = await Promise.all([
      caller.app.list({ limit: 50, cursor }),
      caller.app.canManage(),
    ]);
    const apps = page.items;
    return (
      <PageContainer>
        <PageHeader
          title="Apps"
          description="Services et raccourcis de votre homelab."
          {...(canManage
            ? {
                actions: (
                  <Link className="ui-btn ui-btn-primary" href="/apps/new">
                    Ajouter une App
                  </Link>
                ),
              }
            : {})}
        />
        {apps.length === 0 ? (
          <EmptyState
            icon={<AppWindow />}
            title="Aucune application"
            description="Aucun service n'est encore enregistré."
          />
        ) : (
          <section className="card-grid">
            {apps.map((app) => (
              <Card
                key={app.id}
                className="entity-card"
                {...(app.color ? { style: { borderColor: app.color } } : {})}
              >
                <CardBody>
                  <div className="ui-card-header" style={{ padding: 0 }}>
                    <span className="app-card-identity">
                      <span className="app-card-icon">
                        <AppIcon src={app.iconRef} name={app.name} />
                      </span>
                      <h2 className="ui-card-title">{app.name}</h2>
                    </span>
                    {app.healthcheckEnabled ? (
                      <Badge tone={tones[app.healthStatus]}>{labels[app.healthStatus]}</Badge>
                    ) : (
                      <Badge>Healthcheck désactivé</Badge>
                    )}
                  </div>
                  {app.description ? (
                    <p className="ui-muted line-clamp-2">{app.description}</p>
                  ) : null}
                  <p className="app-card-url">{app.url}</p>
                  {app.tags.length > 0 ? <p className="ui-muted">{app.tags.join(" · ")}</p> : null}
                </CardBody>
                <CardFooter>
                  <a
                    className="ui-btn"
                    href={app.url}
                    {...(app.target === "new-tab"
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : { target: "_self" })}
                  >
                    Ouvrir
                  </a>
                  {canManage ? (
                    <>
                      <Link className="ui-btn ui-btn-ghost" href={`/apps/${app.id}/edit`}>
                        Modifier
                      </Link>
                      <form action={testAppAction.bind(null, app.id)}>
                        <button type="submit">Tester maintenant</button>
                      </form>
                      <DeleteAppControl action={deleteAppAction.bind(null, app.id)} />
                    </>
                  ) : null}
                </CardFooter>
              </Card>
            ))}
          </section>
        )}
        {page.nextCursor ? (
          <p style={{ marginTop: "1rem" }}>
            <Link href={`/apps?cursor=${page.nextCursor}`}>Page suivante</Link>
          </p>
        ) : null}
      </PageContainer>
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "UNAUTHORIZED")
      redirect("/login");
    if (error && typeof error === "object" && "code" in error && error.code === "FORBIDDEN")
      redirect("/forbidden");
    throw error;
  }
}
