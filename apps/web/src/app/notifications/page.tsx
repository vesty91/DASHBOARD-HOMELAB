import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { safeDestinationPath } from "@dashboard/notifications/browser";
import { Badge, EmptyState, PageContainer, PageHeader } from "@dashboard/ui";
import { getBoardCaller } from "@/lib/server/board-api";
import {
  dismissNotificationFormAction,
  markAllNotificationsReadFormAction,
  markNotificationReadFormAction,
} from "./actions";
import {
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  SEVERITY_TONES,
  SOURCE_LABELS,
  formatNotificationTime,
} from "./labels";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const caller = await getBoardCaller();
  const permissions = await caller.notification.permissions();
  if (!permissions.canRead) redirect("/forbidden");

  const { items } = await caller.notification.list({ limit: 50, includeDismissed: false });

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        description="Boîte de réception in-app : alertes d’intégrations, automations et incidents."
        {...(permissions.canManage && items.some((item) => item.readAt == null)
          ? {
              actions: (
                <form action={markAllNotificationsReadFormAction}>
                  <button
                    type="submit"
                    className="ui-btn ui-btn-secondary"
                    data-testid="notification-page-mark-all-read"
                  >
                    Tout marquer lu
                  </button>
                </form>
              ),
            }
          : {})}
      />
      {items.length === 0 ? (
        <EmptyState
          icon={<Bell />}
          title="Aucune notification"
          description="Les nouvelles alertes apparaîtront ici dès qu’un événement pertinent survient."
        />
      ) : (
        <ul className="notification-page-list" aria-label="Notifications">
          {items.map((item) => {
            const unread = item.readAt == null;
            const destination = safeDestinationPath(item.destinationPath);
            return (
              <li key={item.id}>
                <article
                  className="notification-item"
                  data-unread={unread ? "true" : "false"}
                  data-testid={`notification-page-item-${item.id}`}
                >
                  <div className="notification-item-header">
                    <Badge tone={SEVERITY_TONES[item.severity]}>
                      {SEVERITY_LABELS[item.severity]}
                    </Badge>
                    <span className="notification-item-meta">
                      {SOURCE_LABELS[item.sourceType]} · {CATEGORY_LABELS[item.category]}
                    </span>
                    {unread ? (
                      <span className="notification-unread-dot" aria-label="Non lue">
                        ●
                      </span>
                    ) : (
                      <span className="notification-item-meta">Lue</span>
                    )}
                  </div>
                  <h2 className="notification-item-title">{item.title}</h2>
                  {item.body ? <p className="notification-item-body">{item.body}</p> : null}
                  <div className="notification-item-footer">
                    <time dateTime={item.createdAt}>{formatNotificationTime(item.createdAt)}</time>
                    <div className="notification-item-actions">
                      {destination ? (
                        <Link className="ui-btn ui-btn-ghost" href={destination}>
                          Ouvrir
                        </Link>
                      ) : null}
                      {permissions.canManage && unread ? (
                        <form action={markNotificationReadFormAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <button type="submit" className="ui-btn ui-btn-ghost">
                            Marquer lue
                          </button>
                        </form>
                      ) : null}
                      {permissions.canManage ? (
                        <form action={dismissNotificationFormAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <button
                            type="submit"
                            className="ui-btn ui-btn-ghost"
                            data-testid={`notification-dismiss-${item.id}`}
                          >
                            Ignorer
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
