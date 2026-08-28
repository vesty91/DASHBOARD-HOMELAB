import { getServerSession } from "next-auth";
import Link from "next/link";
import { AppWindow, LayoutGrid, Plug } from "lucide-react";
import { PageContainer } from "@dashboard/ui";
import { PublicAuthLayout } from "@/components/public-auth-layout";
import { AppShellServer } from "@/components/shell/app-shell-server";
import { getShellContext } from "@/components/shell/get-shell-context";
import { authOptions } from "@/lib/server/auth";
import { getBoardCaller } from "@/lib/server/board-api";
import { getDatabase } from "@/lib/server/database";

function isDenied(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN"),
  );
}

async function countOrNull(load: () => Promise<number | null>): Promise<number | null> {
  try {
    return await load();
  } catch (error) {
    if (isDenied(error)) return null;
    throw error;
  }
}

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const { authStore } = await getDatabase();
    const onboarded = await authStore.isOnboardingCompleted();
    return (
      <PublicAuthLayout
        title="Homelab Dashboard"
        description="Tableau de bord self-hosted pour votre homelab."
      >
        {onboarded ? (
          <Link className="ui-btn ui-btn-primary" href="/login">
            Connexion
          </Link>
        ) : (
          <Link className="ui-btn ui-btn-primary" href="/setup">
            Initialiser
          </Link>
        )}
      </PublicAuthLayout>
    );
  }

  const { nav } = await getShellContext();
  const caller = await getBoardCaller();
  const [boardCount, appCount, integrationCount] = await Promise.all([
    nav.boards
      ? countOrNull(async () => (await caller.board.list()).length)
      : Promise.resolve(null),
    nav.apps
      ? countOrNull(async () => {
          const page = await caller.app.list({ limit: 50 });
          return page.nextCursor ? null : page.items.length;
        })
      : Promise.resolve(null),
    nav.integrations
      ? countOrNull(async () => {
          const page = await caller.integration.list({ limit: 50 });
          return page.nextCursor ? null : page.items.length;
        })
      : Promise.resolve(null),
  ]);

  const shortcuts = [
    nav.boards
      ? {
          href: "/boards",
          title: "Boards",
          description: "Gérer vos dashboards",
          icon: <LayoutGrid />,
          count: boardCount,
        }
      : null,
    nav.apps
      ? {
          href: "/apps",
          title: "Applications",
          description: "Gérer les services et raccourcis",
          icon: <AppWindow />,
          count: appCount,
        }
      : null,
    nav.integrations
      ? {
          href: "/integrations",
          title: "Intégrations",
          description: "Configurer les connexions externes",
          icon: <Plug />,
          count: integrationCount,
        }
      : null,
  ].filter((item) => item !== null);

  return (
    <AppShellServer>
      <PageContainer>
        <h1 className="sr-only">Accueil</h1>
        <p className="home-lead">Vue d&apos;ensemble de votre homelab.</p>
        <section className="home-grid" aria-label="Raccourcis">
          {shortcuts.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shortcut-card"
              {...(item.count != null ? { "aria-label": `${item.title}, ${item.count}` } : {})}
            >
              <span className="shortcut-card-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="shortcut-card-copy">
                <span className="ui-card-title">{item.title}</span>
                <span className="ui-muted">{item.description}</span>
              </span>
              {item.count != null ? (
                <span className="shortcut-card-count">{item.count}</span>
              ) : null}
            </Link>
          ))}
        </section>
      </PageContainer>
    </AppShellServer>
  );
}
