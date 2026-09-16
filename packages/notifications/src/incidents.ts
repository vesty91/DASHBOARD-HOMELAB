import { hasPermission, type PermissionSubject } from "@dashboard/permissions";
import { NotificationError } from "./errors";
import {
  parseIncidentListQuery,
  parseIncidentTimelineQuery,
  sanitizeIncidentSummary,
} from "./incident-schemas";
import type { NotificationCreateInput } from "./schemas";
import type { NotificationRecord } from "./service";
import {
  INCIDENT_OPEN_SEVERITY,
  INCIDENT_RECOVER_SEVERITY,
  type IncidentEventType,
  type IncidentKind,
  type IncidentStatus,
  type NotificationSeverity,
} from "./types";

export type IncidentActor = {
  userId: string | null;
  subject: PermissionSubject | null;
};

export interface IncidentRecord {
  id: string;
  integrationId: string;
  kind: IncidentKind;
  severity: NotificationSeverity;
  status: IncidentStatus;
  openedAt: Date;
  lastChangedAt: Date;
  resolvedAt: Date | null;
  openingEventId: string | null;
  closingEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IncidentEventRecord {
  id: string;
  incidentId: string;
  eventType: IncidentEventType;
  summary: string;
  createdAt: Date;
}

export interface IncidentView {
  id: string;
  integrationId: string | null;
  kind: IncidentKind;
  severity: NotificationSeverity;
  status: IncidentStatus;
  openedAt: string;
  lastChangedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentEventView {
  id: string;
  eventType: IncidentEventType;
  summary: string;
  createdAt: string;
}

export type IncidentStatusChangedInput = {
  integrationId: string;
  integrationType: string;
  status: "unknown" | "available" | "unavailable";
  occurredAt: string;
};

export type IncidentHandleResult = {
  action: "opened" | "resolved" | "noop";
  incidentId: string | null;
};

export interface IncidentStorePort {
  findOpen(integrationId: string, kind: IncidentKind): Promise<IncidentRecord | null>;
  findByOpeningEventId(openingEventId: string): Promise<IncidentRecord | null>;
  findByClosingEventId(closingEventId: string): Promise<IncidentRecord | null>;
  get(id: string): Promise<IncidentRecord | null>;
  list(input: {
    limit: number;
    cursorCreatedAt?: Date;
    cursorId?: string;
    status?: IncidentStatus;
    integrationId?: string;
    kind?: IncidentKind;
  }): Promise<IncidentRecord[]>;
  openAvailability(input: {
    integrationId: string;
    severity: NotificationSeverity;
    openingEventId: string;
    summary: string;
    now: Date;
  }): Promise<IncidentRecord>;
  resolve(input: {
    id: string;
    closingEventId: string;
    summary: string;
    now: Date;
  }): Promise<IncidentRecord | null>;
  listEvents(incidentId: string, limit: number): Promise<IncidentEventRecord[]>;
}

function requireActive(actor: IncidentActor): asserts actor is IncidentActor & {
  userId: string;
  subject: PermissionSubject;
} {
  if (!actor.userId || !actor.subject || actor.subject.status !== "active")
    throw new NotificationError("FORBIDDEN", "Authentication required");
}

function requireIncidentRead(actor: IncidentActor): void {
  requireActive(actor);
  if (!hasPermission(actor.subject, "incident.read"))
    throw new NotificationError("DENIED_PERMISSION", "Permission denied");
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toView(row: IncidentRecord, redactIntegration: boolean): IncidentView {
  return {
    id: row.id,
    integrationId: redactIntegration ? null : row.integrationId,
    kind: row.kind,
    severity: row.severity,
    status: row.status,
    openedAt: row.openedAt.toISOString(),
    lastChangedAt: row.lastChangedAt.toISOString(),
    resolvedAt: toIso(row.resolvedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toEventView(row: IncidentEventRecord): IncidentEventView {
  return {
    id: row.id,
    eventType: row.eventType,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
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

function safeIntegrationTypeLabel(integrationType: string): string {
  const trimmed = integrationType.trim().slice(0, 64);
  if (!/^[A-Za-z0-9._:-]+$/u.test(trimmed)) return "Integration";
  return trimmed;
}

function buildStatusEventId(input: IncidentStatusChangedInput): string {
  return `status:${input.integrationId}:${input.status}:${input.occurredAt}`;
}

function openSummary(integrationType: string): string {
  return sanitizeIncidentSummary(
    `${safeIntegrationTypeLabel(integrationType)} became unavailable.`,
  );
}

function resolveSummary(integrationType: string): string {
  return sanitizeIncidentSummary(`${safeIntegrationTypeLabel(integrationType)} recovered.`);
}

export function createIncidentService(deps: {
  store: IncidentStorePort;
  notifications: {
    createForUser(input: NotificationCreateInput): Promise<NotificationRecord>;
  };
  listRecipientUserIds: (integrationId: string) => Promise<readonly string[]>;
  integrationAccessible?: (userId: string, integrationId: string) => Promise<boolean>;
}) {
  async function maybeRedact(row: IncidentRecord, viewerUserId: string): Promise<IncidentView> {
    let redact = false;
    if (deps.integrationAccessible) {
      const ok = await deps.integrationAccessible(viewerUserId, row.integrationId);
      redact = !ok;
    }
    return toView(row, redact);
  }

  async function fanOut(input: {
    userIds: readonly string[];
    category: "integration";
    severity: NotificationSeverity;
    title: string;
    body: string;
    sourceId: string;
    sourceIntegrationId: string;
    dedupKey: string;
    destinationPath: string;
  }): Promise<void> {
    for (const userId of input.userIds) {
      await deps.notifications.createForUser({
        userId,
        category: input.category,
        severity: input.severity,
        title: input.title,
        body: input.body,
        sourceType: "incident",
        sourceId: input.sourceId,
        sourceIntegrationId: input.sourceIntegrationId,
        dedupKey: input.dedupKey,
        destinationPath: input.destinationPath,
      });
    }
  }

  async function openFromUnavailable(
    event: IncidentStatusChangedInput,
  ): Promise<IncidentHandleResult> {
    const openingEventId = buildStatusEventId(event);
    const existingByEvent = await deps.store.findByOpeningEventId(openingEventId);
    if (existingByEvent) return { action: "noop", incidentId: existingByEvent.id };

    const open = await deps.store.findOpen(event.integrationId, "availability");
    if (open) return { action: "noop", incidentId: open.id };

    const summary = openSummary(event.integrationType);
    const now = new Date(event.occurredAt);
    const incident = await deps.store.openAvailability({
      integrationId: event.integrationId,
      severity: INCIDENT_OPEN_SEVERITY,
      openingEventId,
      summary,
      now: Number.isNaN(now.getTime()) ? new Date() : now,
    });

    const recipients = await deps.listRecipientUserIds(event.integrationId);
    const label = safeIntegrationTypeLabel(event.integrationType);
    await fanOut({
      userIds: recipients,
      category: "integration",
      severity: INCIDENT_OPEN_SEVERITY,
      title: `${label} unavailable`,
      body: summary,
      sourceId: incident.id,
      sourceIntegrationId: event.integrationId,
      dedupKey: `incident:availability:open:${event.integrationId}`,
      destinationPath: `/incidents/${incident.id}`,
    });

    return { action: "opened", incidentId: incident.id };
  }

  async function resolveFromAvailable(
    event: IncidentStatusChangedInput,
  ): Promise<IncidentHandleResult> {
    const closingEventId = buildStatusEventId(event);
    const existingByEvent = await deps.store.findByClosingEventId(closingEventId);
    if (existingByEvent) return { action: "noop", incidentId: existingByEvent.id };

    const open = await deps.store.findOpen(event.integrationId, "availability");
    if (!open) return { action: "noop", incidentId: null };

    const summary = resolveSummary(event.integrationType);
    const now = new Date(event.occurredAt);
    const resolved = await deps.store.resolve({
      id: open.id,
      closingEventId,
      summary,
      now: Number.isNaN(now.getTime()) ? new Date() : now,
    });
    if (!resolved) return { action: "noop", incidentId: open.id };

    const recipients = await deps.listRecipientUserIds(event.integrationId);
    const label = safeIntegrationTypeLabel(event.integrationType);
    await fanOut({
      userIds: recipients,
      category: "integration",
      severity: INCIDENT_RECOVER_SEVERITY,
      title: `${label} recovered`,
      body: summary,
      sourceId: resolved.id,
      sourceIntegrationId: event.integrationId,
      dedupKey: `incident:availability:recover:${resolved.id}`,
      destinationPath: `/incidents/${resolved.id}`,
    });

    return { action: "resolved", incidentId: resolved.id };
  }

  return {
    permissions(actor: IncidentActor) {
      const subject = actor.subject;
      const active = Boolean(subject && subject.status === "active");
      return {
        canRead: Boolean(active && subject && hasPermission(subject, "incident.read")),
      };
    },

    async handleStatusChanged(event: IncidentStatusChangedInput): Promise<IncidentHandleResult> {
      switch (event.status) {
        case "unavailable":
          return openFromUnavailable(event);
        case "available":
          return resolveFromAvailable(event);
        case "unknown":
          return { action: "noop", incidentId: null };
        default: {
          const _exhaustive: never = event.status;
          return _exhaustive;
        }
      }
    },

    async list(
      actor: IncidentActor,
      query: unknown,
    ): Promise<{ items: IncidentView[]; nextCursor: string | null }> {
      requireIncidentRead(actor);
      const parsed = parseIncidentListQuery(query ?? {});
      const cursor = parseCursor(parsed.cursor);
      const rows = await deps.store.list({
        limit: parsed.limit + 1,
        ...(parsed.status ? { status: parsed.status } : {}),
        ...(parsed.integrationId ? { integrationId: parsed.integrationId } : {}),
        ...(parsed.kind ? { kind: parsed.kind } : {}),
        ...(cursor ? { cursorCreatedAt: cursor.createdAt, cursorId: cursor.id } : {}),
      });
      const page = rows.slice(0, parsed.limit);
      const items = await Promise.all(page.map((row) => maybeRedact(row, actor.userId!)));
      const last = page[page.length - 1];
      const nextCursor =
        rows.length > parsed.limit && last
          ? `${last.lastChangedAt.toISOString()}|${last.id}`
          : null;
      return { items, nextCursor };
    },

    async get(id: string, actor: IncidentActor): Promise<IncidentView> {
      requireIncidentRead(actor);
      const row = await deps.store.get(id);
      if (!row) throw new NotificationError("NOT_FOUND", "Incident not found");
      return maybeRedact(row, actor.userId!);
    },

    async timeline(
      actor: IncidentActor,
      query: unknown,
    ): Promise<{ incident: IncidentView; events: IncidentEventView[] }> {
      requireIncidentRead(actor);
      const parsed = parseIncidentTimelineQuery(query);
      const row = await deps.store.get(parsed.id);
      if (!row) throw new NotificationError("NOT_FOUND", "Incident not found");
      const events = await deps.store.listEvents(parsed.id, parsed.limit);
      return {
        incident: await maybeRedact(row, actor.userId!),
        events: events.map(toEventView),
      };
    },
  };
}

export type IncidentService = ReturnType<typeof createIncidentService>;
