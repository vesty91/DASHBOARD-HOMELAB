import { hasPermission, type PermissionSubject } from "@dashboard/permissions";
import { StatusPageError } from "./errors";
import { deriveMaintenanceStatus, rangesOverlap } from "./maintenance-derive";
import { validateMaintenanceWindowBounds } from "./maintenance-schemas";
import type {
  MaintenanceWindowDto,
  MaintenanceWindowRecord,
  MaintenanceWindowSnapshot,
  MaintenanceWindowStatus,
  PublicMaintenanceWindowDto,
  StatusPageActor,
  StatusPageStorePort,
} from "./types";

export interface MaintenanceNotificationPort {
  createForUser(input: {
    userId: string;
    category: "system";
    severity: "info" | "success" | "warning";
    title: string;
    body: string;
    sourceType: "system";
    sourceId: string;
    dedupKey: string;
    destinationPath: string;
  }): Promise<unknown>;
}

export interface MaintenanceServiceDeps {
  store: StatusPageStorePort;
  notifications?: MaintenanceNotificationPort;
  listRecipientUserIds?: () => Promise<readonly string[]>;
  now?: () => Date;
  publicCacheInvalidate?: (pageId: string) => void;
}

function requireActive(actor: StatusPageActor): asserts actor is StatusPageActor & {
  userId: string;
  subject: PermissionSubject;
} {
  if (!actor.userId || !actor.subject || actor.subject.status !== "active") {
    throw new StatusPageError("UNAUTHORIZED", "Authentication required");
  }
}

function requireStatusPagePermission(
  actor: StatusPageActor,
  permission: "status-page.read" | "status-page.manage",
): void {
  requireActive(actor);
  if (permission === "status-page.read") {
    if (
      hasPermission(actor.subject, "status-page.read") ||
      hasPermission(actor.subject, "status-page.manage")
    ) {
      return;
    }
    throw new StatusPageError("DENIED_PERMISSION", "Permission denied");
  }
  if (!hasPermission(actor.subject, permission)) {
    throw new StatusPageError("DENIED_PERMISSION", "Permission denied");
  }
}

function toDto(snapshot: MaintenanceWindowSnapshot, now: Date): MaintenanceWindowDto {
  const status = deriveMaintenanceStatus(
    snapshot.window.status,
    snapshot.window.startsAt,
    snapshot.window.endsAt,
    now,
  );
  return {
    id: snapshot.window.id,
    name: snapshot.window.name,
    description: snapshot.window.description,
    startsAt: snapshot.window.startsAt.toISOString(),
    endsAt: snapshot.window.endsAt.toISOString(),
    status,
    integrationIds: snapshot.integrationIds,
    createdBy: snapshot.window.createdBy,
    createdAt: snapshot.window.createdAt.toISOString(),
    updatedAt: snapshot.window.updatedAt.toISOString(),
  };
}

export function toPublicMaintenanceDto(
  snapshot: MaintenanceWindowSnapshot,
  now: Date,
): PublicMaintenanceWindowDto | null {
  const status = deriveMaintenanceStatus(
    snapshot.window.status,
    snapshot.window.startsAt,
    snapshot.window.endsAt,
    now,
  );
  if (status !== "scheduled" && status !== "active") return null;
  return {
    id: snapshot.window.id,
    name: snapshot.window.name,
    description: snapshot.window.description,
    startsAt: snapshot.window.startsAt.toISOString(),
    endsAt: snapshot.window.endsAt.toISOString(),
    status,
  };
}

function destinationPath(maintenanceId: string): string {
  return `/status-pages/maintenance/${maintenanceId}`;
}

export function createMaintenanceWindowService(deps: MaintenanceServiceDeps) {
  const now = deps.now ?? (() => new Date());

  async function fanOut(input: {
    phase: "scheduled" | "starting" | "completed";
    window: MaintenanceWindowRecord;
  }): Promise<void> {
    if (!deps.notifications || !deps.listRecipientUserIds) return;
    const userIds = await deps.listRecipientUserIds();
    const title =
      input.phase === "scheduled"
        ? `Maintenance scheduled: ${input.window.name}`
        : input.phase === "starting"
          ? `Maintenance starting: ${input.window.name}`
          : `Maintenance completed: ${input.window.name}`;
    const body =
      input.phase === "scheduled"
        ? `${input.window.name} is scheduled from ${input.window.startsAt.toISOString()} to ${input.window.endsAt.toISOString()} (UTC).`
        : input.phase === "starting"
          ? `${input.window.name} is now active until ${input.window.endsAt.toISOString()} (UTC).`
          : `${input.window.name} ended at ${input.window.endsAt.toISOString()} (UTC).`;
    const severity =
      input.phase === "completed" ? "success" : input.phase === "starting" ? "warning" : "info";
    for (const userId of userIds) {
      await deps.notifications.createForUser({
        userId,
        category: "system",
        severity,
        title,
        body,
        sourceType: "system",
        sourceId: input.window.id,
        dedupKey: `maintenance:${input.window.id}:${input.phase}`,
        destinationPath: destinationPath(input.window.id),
      });
    }
  }

  async function invalidatePagesForIntegrations(integrationIds: readonly string[]): Promise<void> {
    if (!deps.publicCacheInvalidate) return;
    const pageIds = await deps.store.listStatusPageIdsForIntegrations(integrationIds);
    for (const pageId of pageIds) deps.publicCacheInvalidate(pageId);
  }

  async function assertNoOverlap(input: {
    startsAt: Date;
    endsAt: Date;
    integrationIds: readonly string[];
    excludeId?: string;
  }): Promise<void> {
    const candidates = await deps.store.listNonTerminalMaintenanceWindows();
    for (const candidate of candidates) {
      if (input.excludeId && candidate.window.id === input.excludeId) continue;
      const sharesTarget = candidate.integrationIds.some((id) => input.integrationIds.includes(id));
      if (!sharesTarget) continue;
      if (
        rangesOverlap(
          input.startsAt,
          input.endsAt,
          candidate.window.startsAt,
          candidate.window.endsAt,
        )
      ) {
        throw new StatusPageError(
          "CONFLICT",
          "Maintenance window overlaps an existing window for a shared integration",
        );
      }
    }
  }

  return {
    async list(actor: StatusPageActor): Promise<MaintenanceWindowDto[]> {
      requireStatusPagePermission(actor, "status-page.read");
      const rows = await deps.store.listMaintenanceWindows();
      const clock = now();
      return rows.map((row) => toDto(row, clock));
    },

    async get(id: string, actor: StatusPageActor): Promise<MaintenanceWindowDto> {
      requireStatusPagePermission(actor, "status-page.read");
      const snapshot = await deps.store.findMaintenanceById(id);
      if (!snapshot) throw new StatusPageError("NOT_FOUND", "Maintenance window not found");
      return toDto(snapshot, now());
    },

    async schedule(
      input: {
        name: string;
        description: string | null;
        startsAt: Date;
        endsAt: Date;
        integrationIds: readonly string[];
      },
      actor: StatusPageActor,
    ): Promise<MaintenanceWindowDto> {
      requireStatusPagePermission(actor, "status-page.manage");
      const clock = now();
      const bounds = validateMaintenanceWindowBounds(input.startsAt, input.endsAt, clock);
      if (!bounds.ok) throw new StatusPageError("VALIDATION_ERROR", bounds.message);

      const uniqueIds = [...new Set(input.integrationIds)];
      if (uniqueIds.length === 0) {
        throw new StatusPageError(
          "VALIDATION_ERROR",
          "At least one integration target is required",
        );
      }
      const existing = await deps.store.findExistingIntegrationIds(uniqueIds);
      if (existing.size !== uniqueIds.length) {
        throw new StatusPageError(
          "VALIDATION_ERROR",
          "One or more integration targets do not exist",
        );
      }

      await assertNoOverlap({
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        integrationIds: uniqueIds,
      });

      const initialStatus = deriveMaintenanceStatus(
        "scheduled",
        input.startsAt,
        input.endsAt,
        clock,
      );
      if (initialStatus === "completed") {
        throw new StatusPageError("VALIDATION_ERROR", "Maintenance window is already in the past");
      }

      const created = await deps.store.createMaintenanceWindow({
        name: input.name,
        description: input.description,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: initialStatus,
        integrationIds: uniqueIds,
        createdBy: actor.userId,
        now: clock,
      });

      await fanOut({ phase: "scheduled", window: created.window });
      if (initialStatus === "active") {
        await fanOut({ phase: "starting", window: created.window });
      }
      await invalidatePagesForIntegrations(uniqueIds);
      return toDto(created, clock);
    },

    async cancel(id: string, actor: StatusPageActor): Promise<MaintenanceWindowDto> {
      requireStatusPagePermission(actor, "status-page.manage");
      const current = await deps.store.findMaintenanceById(id);
      if (!current) throw new StatusPageError("NOT_FOUND", "Maintenance window not found");
      const clock = now();
      const derived = deriveMaintenanceStatus(
        current.window.status,
        current.window.startsAt,
        current.window.endsAt,
        clock,
      );
      if (derived === "completed" || current.window.status === "cancelled") {
        throw new StatusPageError("CONFLICT", "Maintenance window cannot be cancelled");
      }
      const updated = await deps.store.updateMaintenanceStatus({
        id,
        fromStatuses: ["scheduled", "active"],
        toStatus: "cancelled",
        now: clock,
      });
      if (!updated) {
        throw new StatusPageError("CONFLICT", "Maintenance window cannot be cancelled");
      }
      await invalidatePagesForIntegrations(updated.integrationIds);
      return toDto(updated, clock);
    },

    /**
     * Worker tick: reconcile stored status with the UTC clock and emit
     * starting/completed notifications. Idempotent and restart-safe via CAS
     * status updates + notification dedupKey.
     */
    async tick(): Promise<{ transitioned: number }> {
      const clock = now();
      const pending = await deps.store.listNonTerminalMaintenanceWindows();
      let transitioned = 0;
      for (const snapshot of pending) {
        const desired = deriveMaintenanceStatus(
          snapshot.window.status,
          snapshot.window.startsAt,
          snapshot.window.endsAt,
          clock,
        );
        if (desired === snapshot.window.status) continue;
        const fromStatuses: MaintenanceWindowStatus[] =
          snapshot.window.status === "scheduled"
            ? ["scheduled"]
            : snapshot.window.status === "active"
              ? ["active"]
              : [];
        if (fromStatuses.length === 0) continue;
        const updated = await deps.store.updateMaintenanceStatus({
          id: snapshot.window.id,
          fromStatuses,
          toStatus: desired,
          now: clock,
        });
        if (!updated) continue;
        transitioned += 1;
        if (desired === "active") {
          await fanOut({ phase: "starting", window: updated.window });
        } else if (desired === "completed") {
          if (snapshot.window.status === "scheduled") {
            await fanOut({ phase: "starting", window: updated.window });
          }
          await fanOut({ phase: "completed", window: updated.window });
        }
        await invalidatePagesForIntegrations(updated.integrationIds);
      }
      return { transitioned };
    },
  };
}

export type MaintenanceWindowService = ReturnType<typeof createMaintenanceWindowService>;
