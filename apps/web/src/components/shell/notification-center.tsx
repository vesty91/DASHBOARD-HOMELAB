"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { Bell } from "lucide-react";
import { safeDestinationPath, type NotificationView } from "@dashboard/notifications/browser";
import { Badge, Button, Dialog, EmptyState, IconButton } from "@dashboard/ui";
import {
  dismissNotificationAction,
  getUnreadNotificationCountAction,
  listNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/notifications/actions";
import {
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  SEVERITY_TONES,
  SOURCE_LABELS,
  formatNotificationTime,
  unreadBadgeLabel,
} from "@/app/notifications/labels";
import { useNotificationRealtime } from "./use-notification-realtime";

function NotificationItem({
  item,
  canManage,
  onChanged,
}: {
  item: NotificationView;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const unread = item.readAt == null;
  const destination = safeDestinationPath(item.destinationPath);

  async function run(action: () => Promise<{ ok: boolean }>): Promise<void> {
    setBusy(true);
    try {
      await action();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className="notification-item"
      data-unread={unread ? "true" : "false"}
      data-testid={`notification-item-${item.id}`}
    >
      <div className="notification-item-header">
        <Badge tone={SEVERITY_TONES[item.severity]}>{SEVERITY_LABELS[item.severity]}</Badge>
        <span className="notification-item-meta">
          {SOURCE_LABELS[item.sourceType]} · {CATEGORY_LABELS[item.category]}
        </span>
        {unread ? (
          <span className="notification-unread-dot" aria-label="Non lue">
            ●
          </span>
        ) : null}
      </div>
      <h3 className="notification-item-title">{item.title}</h3>
      {item.body ? <p className="notification-item-body">{item.body}</p> : null}
      <div className="notification-item-footer">
        <time dateTime={item.createdAt}>{formatNotificationTime(item.createdAt)}</time>
        <div className="notification-item-actions">
          {destination ? (
            <Link className="ui-btn ui-btn-ghost" href={destination}>
              Ouvrir
            </Link>
          ) : null}
          {canManage && unread ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void run(async () => markNotificationReadAction(item.id))}
            >
              Marquer lue
            </Button>
          ) : null}
          {canManage ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void run(async () => dismissNotificationAction(item.id))}
            >
              Ignorer
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function NotificationCenter({
  canRead,
  canManage,
}: {
  canRead: boolean;
  canManage: boolean;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!canRead) return;
    try {
      const count = await getUnreadNotificationCountAction();
      setUnreadCount(count);
      if (open) {
        setLoading(true);
        const page = await listNotificationsAction({ limit: 20 });
        setItems(page.items);
        setError(null);
      }
    } catch {
      setError("Impossible de charger les notifications.");
    } finally {
      setLoading(false);
    }
  }, [canRead, open]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useNotificationRealtime(canRead, () => {
    void refresh();
  });

  if (!canRead) return null;

  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);
  const bellLabel =
    unreadCount > 0
      ? `Notifications, ${unreadBadgeLabel(unreadCount)}`
      : "Notifications, aucune non lue";

  return (
    <>
      <div className="shell-notification-trigger">
        <IconButton
          label={bellLabel}
          aria-expanded={open}
          aria-haspopup="dialog"
          data-testid="notification-bell"
          onClick={() => setOpen(true)}
        >
          <Bell />
          {unreadCount > 0 ? (
            <span
              className="shell-notification-badge"
              data-testid="notification-unread-badge"
              aria-hidden="true"
            >
              {badgeText}
            </span>
          ) : null}
        </IconButton>
        <span className="sr-only" data-testid="notification-unread-status" aria-live="polite">
          {unreadBadgeLabel(unreadCount)}
        </span>
      </div>
      <Dialog
        open={open}
        title="Notifications"
        onClose={() => setOpen(false)}
        className="notification-center-dialog"
      >
        <div className="notification-center" aria-labelledby={titleId}>
          <div className="notification-center-toolbar">
            <p id={titleId} className="notification-center-summary">
              {unreadBadgeLabel(unreadCount)}
            </p>
            <div className="notification-center-toolbar-actions">
              {canManage && unreadCount > 0 ? (
                <Button
                  variant="secondary"
                  data-testid="notification-mark-all-read"
                  onClick={() => {
                    void markAllNotificationsReadAction().then(() => refresh());
                  }}
                >
                  Tout marquer lu
                </Button>
              ) : null}
              <Link
                className="ui-btn ui-btn-ghost"
                href="/notifications"
                onClick={() => setOpen(false)}
              >
                Voir tout
              </Link>
              <Link
                className="ui-btn ui-btn-ghost"
                href="/account/security#push"
                data-testid="notification-push-prefs-link"
                onClick={() => setOpen(false)}
              >
                Préférences push
              </Link>
            </div>
          </div>
          {error ? <p className="notification-center-error">{error}</p> : null}
          {loading && items.length === 0 ? (
            <p className="notification-center-loading">Chargement…</p>
          ) : null}
          {!loading && items.length === 0 ? (
            <EmptyState
              icon={<Bell />}
              title="Aucune notification"
              description="Les alertes in-app apparaîtront ici."
            />
          ) : (
            <ul className="notification-list" aria-label="Liste des notifications">
              {items.map((item) => (
                <li key={item.id}>
                  <NotificationItem
                    item={item}
                    canManage={canManage}
                    onChanged={() => void refresh()}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </>
  );
}
