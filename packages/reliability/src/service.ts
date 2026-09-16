import { randomUUID } from "node:crypto";
import { hasPermission, type PermissionSubject } from "@dashboard/permissions";
import {
  RELIABILITY_RETENTION_DAYS,
  buildDailyRollup,
  clampRebuildDays,
  listUtcDatesInclusive,
  utcDateString,
  utcDayStartMs,
  MS_PER_DAY,
  assertRollupInvariants,
} from "./aggregation";
import { ReliabilityError } from "./errors";
import type { ReliabilityStorePort } from "./ports";
import {
  createSloSchema,
  deleteSloSchema,
  evaluateSloSchema,
  getSloSchema,
  listDailyReliabilitySchema,
  listSlosSchema,
  rebuildReliabilitySchema,
  summarizeReliabilitySchema,
  updateSloSchema,
  type CreateSloInput,
  type DeleteSloInput,
  type EvaluateSloInput,
  type ListDailyReliabilityInput,
  type ListSlosInput,
  type RebuildReliabilityInput,
  type SummarizeReliabilityInput,
  type UpdateSloInput,
} from "./schemas";
import { SLO_OBJECTIVE_BPS_MAX, computeSloFromDaily } from "./slo-math";
import type { ReliabilityServiceSummary, ServiceSlo } from "./types";

export type ReliabilityActor = {
  userId: string | null;
  subject: PermissionSubject | null;
};

function requireRead(actor: ReliabilityActor): asserts actor is ReliabilityActor & {
  subject: PermissionSubject;
} {
  if (!actor.subject || actor.subject.status !== "active") {
    throw new ReliabilityError("UNAUTHORIZED", "Authentication required");
  }
  if (!hasPermission(actor.subject, "reliability.read")) {
    throw new ReliabilityError("FORBIDDEN", "reliability.read required");
  }
}

function requireSloManage(actor: ReliabilityActor): asserts actor is ReliabilityActor & {
  subject: PermissionSubject;
} {
  if (!actor.subject || actor.subject.status !== "active") {
    throw new ReliabilityError("UNAUTHORIZED", "Authentication required");
  }
  if (!hasPermission(actor.subject, "slo.manage")) {
    throw new ReliabilityError("FORBIDDEN", "slo.manage required");
  }
}

export function createReliabilityService(deps: {
  store: ReliabilityStorePort;
  now?: () => Date;
  createId?: () => string;
}) {
  const now = deps.now ?? (() => new Date());
  const createId = deps.createId ?? (() => randomUUID());

  async function rebuildWindow(input: {
    days: number;
    serviceKeys?: readonly string[];
    nowMs?: number;
  }): Promise<{ days: number; upserted: number }> {
    const days = clampRebuildDays(input.days);
    const nowMs = input.nowMs ?? now().getTime();
    const toDate = utcDateString(nowMs);
    const fromDate = utcDateString(nowMs - (days - 1) * MS_PER_DAY);
    const dates = listUtcDatesInclusive(fromDate, toDate);
    const fromMs = utcDayStartMs(fromDate);
    const toMs = utcDayStartMs(toDate) + MS_PER_DAY;

    const presence = await deps.store.listIntegrationPresence();
    const filtered =
      input.serviceKeys && input.serviceKeys.length > 0
        ? presence.filter((item) => input.serviceKeys!.includes(item.serviceKey))
        : presence;

    const [incidents, maintenances] = await Promise.all([
      deps.store.listIncidentsBetween(fromMs - MS_PER_DAY, toMs),
      deps.store.listMaintenancesBetween(fromMs - MS_PER_DAY, toMs),
    ]);

    const rows = [];
    for (const service of filtered) {
      for (const dateUtc of dates) {
        const rollup = buildDailyRollup({
          id: createId(),
          serviceKey: service.serviceKey,
          dateUtc,
          nowMs,
          presence: service,
          incidents,
          maintenances,
        });
        assertRollupInvariants(rollup);
        rows.push(rollup);
      }
    }
    await deps.store.upsertDaily(rows);
    return { days, upserted: rows.length };
  }

  async function requireSlo(id: string): Promise<ServiceSlo> {
    const slo = await deps.store.getSlo(id);
    if (!slo) throw new ReliabilityError("NOT_FOUND", "SLO not found");
    return slo;
  }

  return {
    permissions(actor: ReliabilityActor) {
      const active = Boolean(actor.subject && actor.subject.status === "active");
      return {
        canRead: Boolean(
          active && actor.subject && hasPermission(actor.subject, "reliability.read"),
        ),
        canManageSlo: Boolean(
          active && actor.subject && hasPermission(actor.subject, "slo.manage"),
        ),
      };
    },

    async listDaily(raw: ListDailyReliabilityInput, actor: ReliabilityActor) {
      requireRead(actor);
      const input = listDailyReliabilitySchema.parse(raw);
      const fromMs = utcDayStartMs(input.fromDateUtc);
      const toMs = utcDayStartMs(input.toDateUtc);
      const spanDays = Math.floor((toMs - fromMs) / MS_PER_DAY) + 1;
      if (spanDays > 90) {
        throw new ReliabilityError("QUERY_TOO_BROAD", "date range max 90 days");
      }
      return deps.store.listDaily({
        serviceKeys: input.serviceKeys,
        fromDateUtc: input.fromDateUtc,
        toDateUtc: input.toDateUtc,
        limit: input.limit,
      });
    },

    async rebuildRecent(raw: RebuildReliabilityInput, actor: ReliabilityActor) {
      requireRead(actor);
      if (!actor.subject.isSystemAdmin && !hasPermission(actor.subject, "settings.manage")) {
        throw new ReliabilityError("FORBIDDEN", "settings.manage required for rebuild");
      }
      const input = rebuildReliabilitySchema.parse(raw);
      return rebuildWindow({
        days: input.days,
        ...(input.serviceKeys ? { serviceKeys: input.serviceKeys } : {}),
      });
    },

    async listSlos(raw: ListSlosInput, actor: ReliabilityActor) {
      requireRead(actor);
      const input = listSlosSchema.parse(raw);
      return deps.store.listSlos({
        ...(input.serviceKeys ? { serviceKeys: input.serviceKeys } : {}),
        limit: input.limit,
      });
    },

    async getSlo(raw: { id: string }, actor: ReliabilityActor) {
      requireRead(actor);
      const input = getSloSchema.parse(raw);
      return requireSlo(input.id);
    },

    async createSlo(raw: CreateSloInput, actor: ReliabilityActor) {
      requireSloManage(actor);
      const input = createSloSchema.parse(raw);
      if (!(await deps.store.integrationExists(input.serviceKey))) {
        throw new ReliabilityError("NOT_FOUND", "Service key not found");
      }
      return deps.store.createSlo({
        id: createId(),
        serviceKey: input.serviceKey,
        name: input.name,
        objectiveBasisPoints: input.objectiveBasisPoints,
        windowDays: input.windowDays,
        excludeMaintenance: input.excludeMaintenance,
        enabled: input.enabled,
        now: now(),
      });
    },

    async updateSlo(raw: UpdateSloInput, actor: ReliabilityActor) {
      requireSloManage(actor);
      const input = updateSloSchema.parse(raw);
      await requireSlo(input.id);
      return deps.store.updateSlo({
        id: input.id,
        expectedConfigRevision: input.expectedConfigRevision,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.objectiveBasisPoints !== undefined
          ? { objectiveBasisPoints: input.objectiveBasisPoints }
          : {}),
        ...(input.windowDays !== undefined ? { windowDays: input.windowDays } : {}),
        ...(input.excludeMaintenance !== undefined
          ? { excludeMaintenance: input.excludeMaintenance }
          : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        now: now(),
      });
    },

    async deleteSlo(raw: DeleteSloInput, actor: ReliabilityActor) {
      requireSloManage(actor);
      const input = deleteSloSchema.parse(raw);
      await requireSlo(input.id);
      await deps.store.deleteSlo(input.id, input.expectedConfigRevision);
    },

    async evaluateSlo(raw: EvaluateSloInput, actor: ReliabilityActor) {
      requireRead(actor);
      const input = evaluateSloSchema.parse(raw);
      const slo = await requireSlo(input.id);
      const nowMs = now().getTime();
      const toDate = utcDateString(nowMs);
      const fromDate = utcDateString(nowMs - (slo.windowDays - 1) * MS_PER_DAY);
      const days = await deps.store.listDaily({
        serviceKeys: [slo.serviceKey],
        fromDateUtc: fromDate,
        toDateUtc: toDate,
        limit: slo.windowDays,
      });
      const computation = computeSloFromDaily({
        days,
        windowDays: slo.windowDays,
        objectiveBasisPoints: slo.objectiveBasisPoints,
        excludeMaintenance: slo.excludeMaintenance,
      });
      return { slo, computation, fromDateUtc: fromDate, toDateUtc: toDate };
    },

    async summarize(raw: SummarizeReliabilityInput, actor: ReliabilityActor) {
      requireRead(actor);
      const input = summarizeReliabilitySchema.parse(raw);
      const nowMs = now().getTime();
      const toDate = utcDateString(nowMs);
      const fromDate = utcDateString(nowMs - (input.windowDays - 1) * MS_PER_DAY);

      let serviceKeys = input.serviceKeys;
      if (!serviceKeys || serviceKeys.length === 0) {
        const presence = await deps.store.listIntegrationPresence();
        serviceKeys = presence.map((item) => item.serviceKey).slice(0, 50);
      }

      if (serviceKeys.length === 0) {
        return {
          windowDays: input.windowDays,
          fromDateUtc: fromDate,
          toDateUtc: toDate,
          services: [] as ReliabilityServiceSummary[],
        };
      }

      const [days, slos] = await Promise.all([
        deps.store.listDaily({
          serviceKeys,
          fromDateUtc: fromDate,
          toDateUtc: toDate,
          limit: input.windowDays,
        }),
        deps.store.listSlos({ serviceKeys, limit: 200 }),
      ]);

      const daysByKey = new Map<string, typeof days>();
      for (const day of days) {
        const bucket = daysByKey.get(day.serviceKey) ?? [];
        bucket.push(day);
        daysByKey.set(day.serviceKey, bucket);
      }

      const slosByKey = new Map<string, ServiceSlo[]>();
      for (const slo of slos) {
        const bucket = slosByKey.get(slo.serviceKey) ?? [];
        bucket.push(slo);
        slosByKey.set(slo.serviceKey, bucket);
      }

      const services: ReliabilityServiceSummary[] = serviceKeys.map((serviceKey) => {
        const serviceDays = daysByKey.get(serviceKey) ?? [];
        const serviceSlos = slosByKey.get(serviceKey) ?? [];
        const enabledSlo = serviceSlos.find((entry) => entry.enabled) ?? serviceSlos[0] ?? null;

        const computation = enabledSlo
          ? computeSloFromDaily({
              days: serviceDays,
              windowDays: enabledSlo.windowDays,
              objectiveBasisPoints: enabledSlo.objectiveBasisPoints,
              excludeMaintenance: enabledSlo.excludeMaintenance,
            })
          : computeSloFromDaily({
              days: serviceDays,
              windowDays: input.windowDays,
              objectiveBasisPoints: SLO_OBJECTIVE_BPS_MAX,
              excludeMaintenance: true,
            });

        const availabilityBasisPoints = computation.availabilityBasisPoints;
        const sloMet =
          enabledSlo && availabilityBasisPoints !== null
            ? availabilityBasisPoints >= enabledSlo.objectiveBasisPoints
            : null;

        return {
          serviceKey,
          days: serviceDays,
          slo: enabledSlo,
          availabilityBasisPoints,
          sloMet,
          remainingBudgetBasisPoints: enabledSlo ? computation.remainingBudgetBasisPoints : null,
        };
      });

      return {
        windowDays: input.windowDays,
        fromDateUtc: fromDate,
        toDateUtc: toDate,
        services,
      };
    },

    async tick(): Promise<{ upserted: number; deleted: number }> {
      const rebuilt = await rebuildWindow({ days: 2 });
      const cutoff = utcDateString(now().getTime() - RELIABILITY_RETENTION_DAYS * MS_PER_DAY);
      const deleted = await deps.store.deleteOlderThan(cutoff);
      return { upserted: rebuilt.upserted, deleted };
    },
  };
}

export type ReliabilityService = ReturnType<typeof createReliabilityService>;
