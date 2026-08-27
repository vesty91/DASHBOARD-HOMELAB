import Link from "next/link";
import { redirect } from "next/navigation";
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
export default async function AppsPage() {
  let caller;
  try {
    caller = await getBoardCaller();
    const [apps, canManage] = await Promise.all([caller.app.list(), caller.app.canManage()]);
    return (
      <main>
        <h1>Apps</h1>
        {canManage && <Link href="/apps/new">Ajouter une App</Link>}{" "}
        {apps.length === 0 ? (
          <p>Aucune App.</p>
        ) : (
          <ul>
            {apps.map((app) => (
              <li key={app.id}>
                <article style={{ borderColor: app.color ?? undefined }}>
                  <AppIcon src={app.iconRef} name={app.name} />
                  <h2>{app.name}</h2>
                  {app.description && <p>{app.description}</p>}
                  <p>
                    {app.healthcheckEnabled ? labels[app.healthStatus] : "Healthcheck désactivé"}
                    {app.lastCheckedAt &&
                      ` — dernier test ${app.lastCheckedAt.toLocaleString("fr-FR")}`}
                  </p>
                  <p>{app.tags.join(" · ")}</p>
                  <a
                    href={app.url}
                    target={app.target === "new-tab" ? "_blank" : "_self"}
                    rel={app.target === "new-tab" ? "noopener noreferrer" : undefined}
                  >
                    Ouvrir
                  </a>
                  {canManage && (
                    <>
                      <Link href={`/apps/${app.id}/edit`}>Modifier</Link>
                      <form action={testAppAction.bind(null, app.id)}>
                        <button type="submit">Tester maintenant</button>
                      </form>
                      <DeleteAppControl action={deleteAppAction.bind(null, app.id)} />
                    </>
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "UNAUTHORIZED")
      redirect("/login");
    if (error && typeof error === "object" && "code" in error && error.code === "FORBIDDEN")
      redirect("/forbidden");
    throw error;
  }
}
