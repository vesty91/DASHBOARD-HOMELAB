import { hasPermission, type PermissionSubject } from "@dashboard/permissions";
import { NotificationError } from "./errors";
import {
  parseNotificationCreate,
  parseNotificationListQuery,
  type NotificationCreateInput,
} from "./schemas";
import {
  NOTIFICATION_DEDUP_WINDOW_MS,
  NOTIFICATION_MAX_PER_USER,
  NOTIFICATION_READ_OR_DISMISSED_RETENTION_MS,
  NOTIFICATION_UNREAD_RETENTION_MS,
  type NotificationCategory,
  type NotificationSeverity,
  type NotificationSourceType,
} from "./types";

export type NotificationActor = {
  userId: string | null;
  subject: PermissionSubject | null;
};

export interface NotificationRecord {
  id: string;
  userId: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  sourceType: NotificationSourceType;
  sourceId: string | null;
  sourceIntegrationId: string | null;
  dedupKey: string | null;
  destinationPath: string | null;
  readAt: Date | null;
  dismissedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationView {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  sourceType: NotificationSourceType;
  sourceId: string | null;
  sourceIntegrationId: string | null;
  destinationPath: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationStorePort {
  create(input: NotificationCreateInput & { now: Date }): Promise<NotificationRecord>;
  updateCoalesced(
    id: string,
    patch: {
      title: string;
      body: string;
      severity: NotificationSeverity;
      category: NotificationCategory;
      sourceType: NotificationSourceType;
      sourceId: string | null;
      sourceIntegrationId: string | null;
      destinationPath: string | null;
      expiresAt: Date | null;
      updatedAt: Date;
      readAt: null;
    },
  ): Promise<NotificationRecord>;
  findRecentByDedup(input: {
    userId: string;
    dedupKey: string;
    since: Date;
  }): Promise<NotificationRecord | null>;
  get(id: string): Promise<NotificationRecord | null>;
  list(input: {
    userId: string;
    limit: number;
    cursorCreatedAt?: Date;
    cursorId?: string;
    includeDismissed: boolean;
  }): Promise<NotificationRecord[]>;
  countUnread(userId: string): Promise<number>;
  markRead(id: string, userId: string, at: Date): Promise<NotificationRecord | null>;
  markAllRead(userId: string, at: Date): Promise<number>;
  dismiss(id: string, userId: string, at: Date): Promise<NotificationRecord | null>;
  countForUser(userId: string): Promise<number>;
  deleteOldestBeyondCap(userId: string, keep: number): Promise<number>;
  purgeExpired(now: Date, cutoffs: { readOrDismissed: Date; unread: Date }): Promise<number>;
}

function requireActive(actor: NotificationActor): asserts actor is NotificationActor & {
  userId: string;
  subject: PermissionSubject;
} {
  if (!actor.userId || !actor.subject || actor.subject.status !== "active")
    throw new NotificationError("FORBIDDEN", "Authentication required");
}

function requireSelfPermission(
  actor: NotificationActor,
  permission: "notification.read.self" | "notification.manage.self",
): void {
  requireActive(actor);
  if (!hasPermission(actor.subject, permission))
    throw new NotificationError("DENIED_PERMISSION", "Permission denied");
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toView(row: NotificationRecord, redactIntegration: boolean): NotificationView {
  return {
    id: row.id,
    category: row.category,
    severity: row.severity,
    title: row.title,
    body: row.body,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceIntegrationId: redactIntegration ? null : row.sourceIntegrationId,
    destinationPath: row.destinationPath,
    readAt: toIso(row.readAt),
    dismissedAt: toIso(row.dismissedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [createdAtRaw, id] = cursor.split("|");
  if (!createdAtRaw || !id) throw new NotificationError("VALIDATION_ERROR", "Invalid cursor");
  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime()))
    throw new NotificationError("VALIDATION_ERROR", "Invalid cursor");
  return { createdAt, id };
}

export function createNotificationService(deps: {
  store: NotificationStorePort;
  integrationAccessible?: (userId: string, integrationId: string) => Promise<boolean>;
  publish?: (event: {
    type: "notification.created" | "notification.updated" | "notification.dismissed";
    userId: string;
    notificationId: string;
    occurredAt: string;
  }) => Promise<void>;
}) {
  async function maybeRedact(
    row: NotificationRecord,
    viewerUserId: string,
  ): Promise<NotificationView> {
    let redact = false;
    if (row.sourceIntegrationId && deps.integrationAccessible) {
      const ok = await deps.integrationAccessible(viewerUserId, row.sourceIntegrationId);
      redact = !ok;
    }
    return toView(row, redact);
  }

  return {
    permissions(actor: NotificationActor) {
      const subject = actor.subject;
      const active = Boolean(subject && subject.status === "active");
      return {
        canRead: Boolean(active && subject && hasPermission(subject, "notification.read.self")),
        canManage: Boolean(active && subject && hasPermission(subject, "notification.manage.self")),
      };
    },

    async createForUser(input: NotificationCreateInput): Promise<NotificationRecord> {
      const parsed = parseNotificationCreate(input);
      const now = new Date();
      if (parsed.dedupKey) {
        const existing = await deps.store.findRecentByDedup({
          userId: parsed.userId,
          dedupKey: parsed.dedupKey,
          since: new Date(now.getTime() - NOTIFICATION_DEDUP_WINDOW_MS),
        });
        if (existing && !existing.dismissedAt) {
          const updated = await deps.store.updateCoalesced(existing.id, {
            title: parsed.title,
            body: parsed.body,
            severity: parsed.severity,
            category: parsed.category,
            sourceType: parsed.sourceType,
            sourceId: parsed.sourceId ?? null,
            sourceIntegrationId: parsed.sourceIntegrationId ?? null,
            destinationPath: parsed.destinationPath ?? null,
            expiresAt: parsed.expiresAt ?? null,
            updatedAt: now,
            readAt: null,
          });
          await deps.publish?.({
            type: "notification.updated",
            userId: updated.userId,
            notificationId: updated.id,
            occurredAt: now.toISOString(),
          });
          return updated;
        }
      }
      const created = await deps.store.create({ ...parsed, now });
      const count = await deps.store.countForUser(parsed.userId);
      if (count > NOTIFICATION_MAX_PER_USER)
        await deps.store.deleteOldestBeyondCap(parsed.userId, NOTIFICATION_MAX_PER_USER);
      await deps.publish?.({
        type: "notification.created",
        userId: created.userId,
        notificationId: created.id,
        occurredAt: now.toISOString(),
      });
      return created;
    },

    async list(
      actor: NotificationActor,
      query: unknown,
    ): Promise<{
      items: NotificationView[];
      nextCursor: string | null;
    }> {
      requireSelfPermission(actor, "notification.read.self");
      const parsed = parseNotificationListQuery(query ?? {});
      const cursor = parseCursor(parsed.cursor);
      const rows = await deps.store.list({
        userId: actor.userId!,
        limit: parsed.limit + 1,
        includeDismissed: parsed.includeDismissed,
        ...(cursor ? { cursorCreatedAt: cursor.createdAt, cursorId: cursor.id } : {}),
      });
      const page = rows.slice(0, parsed.limit);
      const items = await Promise.all(page.map((row) => maybeRedact(row, actor.userId!)));
      const last = page[page.length - 1];
      const nextCursor =
        rows.length > parsed.limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null;
      return { items, nextCursor };
    },

    async countUnread(actor: NotificationActor): Promise<number> {
      requireSelfPermission(actor, "notification.read.self");
      return deps.store.countUnread(actor.userId!);
    },

    async markRead(id: string, actor: NotificationActor): Promise<NotificationView> {
      requireSelfPermission(actor, "notification.manage.self");
      const updated = await deps.store.markRead(id, actor.userId!, new Date());
      if (!updated) throw new NotificationError("NOT_FOUND", "Notification not found");
      await deps.publish?.({
        type: "notification.updated",
        userId: updated.userId,
        notificationId: updated.id,
        occurredAt: new Date().toISOString(),
      });
      return maybeRedact(updated, actor.userId!);
    },

    async markAllRead(actor: NotificationActor): Promise<{ updated: number }> {
      requireSelfPermission(actor, "notification.manage.self");
      const updated = await deps.store.markAllRead(actor.userId!, new Date());
      return { updated };
    },

    async dismiss(id: string, actor: NotificationActor): Promise<NotificationView> {
      requireSelfPermission(actor, "notification.manage.self");
      const updated = await deps.store.dismiss(id, actor.userId!, new Date());
      if (!updated) throw new NotificationError("NOT_FOUND", "Notification not found");
      await deps.publish?.({
        type: "notification.dismissed",
        userId: updated.userId,
        notificationId: updated.id,
        occurredAt: new Date().toISOString(),
      });
      return maybeRedact(updated, actor.userId!);
    },

    async purgeExpired(now = new Date()): Promise<number> {
      return deps.store.purgeExpired(now, {
        readOrDismissed: new Date(now.getTime() - NOTIFICATION_READ_OR_DISMISSED_RETENTION_MS),
        unread: new Date(now.getTime() - NOTIFICATION_UNREAD_RETENTION_MS),
      });
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
