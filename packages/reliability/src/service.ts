import { randomUUID } from "node:crypto";
import { hasPermission, type PermissionSubject } from "@dashboard/permissions";
import {
  RELIABILITY_HOURLY_RETENTION_HOURS,
  RELIABILITY_RETENTION_DAYS,
  RELIABILITY_REBUILD_DEFAULT_HOURS,
  buildDailyRollup,
  buildHourlyRollup,
  clampRebuildDays,
  listUtcDatesInclusive,
  listUtcHoursInclusive,
  utcDateString,
  utcDayStartMs,
  utcHourStartMs,
  utcHourString,
  MS_PER_DAY,
  MS_PER_HOUR,
  assertRollupInvariants,
} from "./aggregation";
import {
  BURN_RATE_WINDOWS_HOURS,
  evaluateBurnRate,
  listClosedUtcHours,
  type BurnRateWindowHours,
  type HourlyBucketInput,
} from "./burn-rate";
import { ReliabilityError } from "./errors";
import type { ReliabilityStorePort } from "./ports";
import {
  createAlertPolicySchema,
  createSloSchema,
  deleteAlertPolicySchema,
  deleteSloSchema,
  evaluateBurnRateSchema,
  evaluateSloSchema,
  getAlertPolicySchema,
  getSloSchema,
  listAlertPoliciesSchema,
  listDailyReliabilitySchema,
  listHourlyReliabilitySchema,
  listSlosSchema,
  rebuildReliabilitySchema,
  summarizeReliabilitySchema,
  updateAlertPolicySchema,
  updateSloSchema,
  type CreateAlertPolicyInput,
  type CreateSloInput,
  type DeleteAlertPolicyInput,
  type DeleteSloInput,
  type EvaluateBurnRateInput,
  type EvaluateSloInput,
  type ListAlertPoliciesInput,
  type ListDailyReliabilityInput,
  type ListHourlyReliabilityInput,
  type ListSlosInput,
  type RebuildReliabilityInput,
  type SummarizeReliabilityInput,
  type UpdateAlertPolicyInput,
  type UpdateSloInput,
} from "./schemas";
import { decideSloAlert, formatSloAlertNotification } from "./slo-alerts";
import { SLO_OBJECTIVE_BPS_MAX, computeSloFromDaily } from "./slo-math";
import type { ReliabilityServiceSummary, ServiceSlo } from "./types";

export type ReliabilityActor = {
  userId: string | null;
  subject: PermissionSubject | null;
};

export type ReliabilityAlertSideEffects = {
  listRecipientUserIds: () => Promise<string[]>;
  createNotification: (input: {
    userId: string;
    title: string;
    body: string;
    severity: "info" | "warning" | "critical";
    dedupKey: string;
    category: "system";
    sourceType: "system";
    sourceId: string;
  }) => Promise<void>;
  publishEvent: (event: {
    type: "slo.burn-rate.changed";
    serviceKey: string;
    sloId: string;
    state: "healthy" | "warning" | "critical" | "insufficient-data";
    burnRate: number | null;
    budgetRemaining: number | null;
    window: "fast" | "slow";
    occurredAt: string;
  }) => Promise<void>;
  dryRun?: boolean;
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
  alerts?: ReliabilityAlertSideEffects;
}) {
  const now = deps.now ?? (() => new Date());
  const createId = deps.createId ?? (() => randomUUID());

  async function computeBurnEvaluation(input: {
    serviceKey: string;
    objectiveBasisPoints: number;
    excludeMaintenance: boolean;
    warningThreshold: number;
    criticalThreshold: number;
    nowMs: number;
  }) {
    const closedHours = listClosedUtcHours({ asOfMs: input.nowMs, windowHours: 72 });
    const fromHourUtc = closedHours[0]!;
    const toHourUtc = closedHours[closedHours.length - 1]!;
    const rows = await deps.store.listHourly({
      serviceKeys: [input.serviceKey],
      fromHourUtc,
      toHourUtc,
      limit: 72,
    });
    const byHour = new Map(rows.map((row) => [row.hourUtc, row]));
    const hoursByWindow: Partial<Record<BurnRateWindowHours, HourlyBucketInput[]>> = {};
    for (const windowHours of BURN_RATE_WINDOWS_HOURS) {
      const needed = listClosedUtcHours({ asOfMs: input.nowMs, windowHours });
      hoursByWindow[windowHours] = needed.map((hourUtc) => {
        const row = byHour.get(hourUtc);
        if (!row) {
          return {
            observedSeconds: 0,
            availableSeconds: 0,
            degradedSeconds: 0,
            unavailableSeconds: 0,
            maintenanceSeconds: 0,
            unknownSeconds: 0,
          };
        }
        return {
          observedSeconds: row.observedSeconds,
          availableSeconds: row.availableSeconds,
          degradedSeconds: row.degradedSeconds,
          unavailableSeconds: row.unavailableSeconds,
          maintenanceSeconds: row.maintenanceSeconds,
          unknownSeconds: row.unknownSeconds,
        };
      });
    }
    return evaluateBurnRate({
      hoursByWindow,
      objectiveBasisPoints: input.objectiveBasisPoints,
      excludeMaintenance: input.excludeMaintenance,
      warningThreshold: input.warningThreshold,
      criticalThreshold: input.criticalThreshold,
    });
  }

  async function processAlertPolicies(nowMs: number): Promise<{
    evaluated: number;
    notified: number;
  }> {
    const policies = await deps.store.listEnabledAlertPolicies();
    let notified = 0;
    for (const policy of policies) {
      const evaluation = await computeBurnEvaluation({
        serviceKey: policy.serviceKey,
        objectiveBasisPoints: policy.objectiveBasisPoints,
        excludeMaintenance: policy.excludeMaintenance,
        warningThreshold: policy.warningThreshold,
        criticalThreshold: policy.criticalThreshold,
        nowMs,
      });
      const previous = await deps.store.getAlertRuntime(policy.sloId);
      const decision = decideSloAlert({
        sloId: policy.sloId,
        policy,
        previous,
        nextState: evaluation.state,
        burnRate: evaluation.pairs.fast.burnRate ?? evaluation.pairs.slow.burnRate,
        nowMs,
      });
      await deps.store.upsertAlertRuntime({
        ...decision.nextRuntime,
        now: new Date(nowMs),
      });
      if (!decision.shouldNotify || !deps.alerts) continue;
      if (deps.alerts.dryRun) continue;
      if (decision.action === "none" || decision.action === "record-only") continue;

      const windowLabel =
        evaluation.pairs.fast.state === decision.nextState
          ? "fast"
          : evaluation.pairs.slow.state === decision.nextState
            ? "slow"
            : "fast";
      const message = formatSloAlertNotification({
        action: decision.action,
        serviceKey: policy.serviceKey,
        state: decision.nextState,
        burnRate: decision.nextRuntime.lastBurnRate,
        windowLabel,
      });
      const recipients = await deps.alerts.listRecipientUserIds();
      const dedupKey = `slo-burn:${policy.sloId}:${decision.nextState}:${Math.floor(nowMs / 60_000)}`;
      for (const userId of recipients) {
        await deps.alerts.createNotification({
          userId,
          title: message.title,
          body: message.body,
          severity: message.severity,
          dedupKey,
          category: "system",
          sourceType: "system",
          sourceId: policy.sloId,
        });
      }
      const budgetRemaining =
        evaluation.pairs.fast.short.budgetRemainingFraction ??
        evaluation.pairs.slow.short.budgetRemainingFraction;
      await deps.alerts.publishEvent({
        type: "slo.burn-rate.changed",
        serviceKey: policy.serviceKey,
        sloId: policy.sloId,
        state: decision.nextState,
        burnRate: decision.nextRuntime.lastBurnRate,
        budgetRemaining,
        window: windowLabel,
        occurredAt: new Date(nowMs).toISOString(),
      });
      notified += 1;
    }
    return { evaluated: policies.length, notified };
  }

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

  async function rebuildHourlyWindow(input: {
    hours: number;
    serviceKeys?: readonly string[];
    nowMs?: number;
  }): Promise<{ hours: number; upserted: number }> {
    const hours = Math.max(1, Math.floor(input.hours));
    const nowMs = input.nowMs ?? now().getTime();
    const toHour = utcHourString(nowMs);
    const fromHour = utcHourString(nowMs - (hours - 1) * MS_PER_HOUR);
    const hourKeys = listUtcHoursInclusive(fromHour, toHour);
    const fromMs = utcHourStartMs(fromHour);
    const toMs = utcHourStartMs(toHour) + MS_PER_HOUR;

    const presence = await deps.store.listIntegrationPresence();
    const filtered =
      input.serviceKeys && input.serviceKeys.length > 0
        ? presence.filter((item) => input.serviceKeys!.includes(item.serviceKey))
        : presence;

    const [incidents, maintenances] = await Promise.all([
      deps.store.listIncidentsBetween(fromMs - MS_PER_HOUR, toMs),
      deps.store.listMaintenancesBetween(fromMs - MS_PER_HOUR, toMs),
    ]);

    const rows = [];
    for (const service of filtered) {
      for (const hourUtc of hourKeys) {
        const rollup = buildHourlyRollup({
          id: createId(),
          serviceKey: service.serviceKey,
          hourUtc,
          nowMs,
          presence: service,
          incidents,
          maintenances,
        });
        assertRollupInvariants(rollup);
        rows.push(rollup);
      }
    }
    await deps.store.upsertHourly(rows);
    return { hours, upserted: rows.length };
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

    async listHourly(raw: ListHourlyReliabilityInput, actor: ReliabilityActor) {
      requireRead(actor);
      const input = listHourlyReliabilitySchema.parse(raw);
      const fromMs = utcHourStartMs(input.fromHourUtc);
      const toMs = utcHourStartMs(input.toHourUtc);
      const spanHours = Math.floor((toMs - fromMs) / MS_PER_HOUR) + 1;
      if (spanHours > 168) {
        throw new ReliabilityError("QUERY_TOO_BROAD", "hour range max 168 hours");
      }
      return deps.store.listHourly({
        serviceKeys: input.serviceKeys,
        fromHourUtc: input.fromHourUtc,
        toHourUtc: input.toHourUtc,
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

    async evaluateBurnRate(raw: EvaluateBurnRateInput, actor: ReliabilityActor) {
      requireRead(actor);
      const input = evaluateBurnRateSchema.parse(raw);
      const slo = await requireSlo(input.id);
      const nowMs = now().getTime();
      const closedHours = listClosedUtcHours({ asOfMs: nowMs, windowHours: 72 });
      const evaluation = await computeBurnEvaluation({
        serviceKey: slo.serviceKey,
        objectiveBasisPoints: slo.objectiveBasisPoints,
        excludeMaintenance: slo.excludeMaintenance,
        warningThreshold: input.warningThreshold ?? 1,
        criticalThreshold: input.criticalThreshold ?? 14.4,
        nowMs,
      });
      return {
        slo,
        evaluation,
        fromHourUtc: closedHours[0]!,
        toHourUtc: closedHours[closedHours.length - 1]!,
        closedHourCount: closedHours.length,
      };
    },

    async listAlertPolicies(raw: ListAlertPoliciesInput, actor: ReliabilityActor) {
      requireRead(actor);
      const input = listAlertPoliciesSchema.parse(raw);
      return deps.store.listAlertPolicies({
        ...(input.sloIds !== undefined ? { sloIds: input.sloIds } : {}),
        limit: input.limit,
      });
    },

    async getAlertPolicy(raw: { id: string }, actor: ReliabilityActor) {
      requireRead(actor);
      const input = getAlertPolicySchema.parse(raw);
      const policy = await deps.store.getAlertPolicy(input.id);
      if (!policy) throw new ReliabilityError("NOT_FOUND", "Alert policy not found");
      return policy;
    },

    async createAlertPolicy(raw: CreateAlertPolicyInput, actor: ReliabilityActor) {
      requireSloManage(actor);
      const input = createAlertPolicySchema.parse(raw);
      await requireSlo(input.sloId);
      const existing = await deps.store.getAlertPolicyBySloId(input.sloId);
      if (existing) {
        throw new ReliabilityError("CONFLICT", "Alert policy already exists for SLO");
      }
      return deps.store.createAlertPolicy({
        id: createId(),
        sloId: input.sloId,
        enabled: input.enabled,
        warningThreshold: input.warningThreshold,
        criticalThreshold: input.criticalThreshold,
        cooldownSeconds: input.cooldownSeconds,
        notifyOnRecovery: input.notifyOnRecovery,
        now: now(),
      });
    },

    async updateAlertPolicy(raw: UpdateAlertPolicyInput, actor: ReliabilityActor) {
      requireSloManage(actor);
      const input = updateAlertPolicySchema.parse(raw);
      const existing = await deps.store.getAlertPolicy(input.id);
      if (!existing) throw new ReliabilityError("NOT_FOUND", "Alert policy not found");
      const warningThreshold = input.warningThreshold ?? existing.warningThreshold;
      const criticalThreshold = input.criticalThreshold ?? existing.criticalThreshold;
      if (!(criticalThreshold > warningThreshold)) {
        throw new ReliabilityError("VALIDATION", "criticalThreshold must be > warningThreshold");
      }
      return deps.store.updateAlertPolicy({
        id: input.id,
        expectedConfigRevision: input.expectedConfigRevision,
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.warningThreshold !== undefined
          ? { warningThreshold: input.warningThreshold }
          : {}),
        ...(input.criticalThreshold !== undefined
          ? { criticalThreshold: input.criticalThreshold }
          : {}),
        ...(input.cooldownSeconds !== undefined ? { cooldownSeconds: input.cooldownSeconds } : {}),
        ...(input.notifyOnRecovery !== undefined
          ? { notifyOnRecovery: input.notifyOnRecovery }
          : {}),
        now: now(),
      });
    },

    async deleteAlertPolicy(raw: DeleteAlertPolicyInput, actor: ReliabilityActor) {
      requireSloManage(actor);
      const input = deleteAlertPolicySchema.parse(raw);
      await deps.store.deleteAlertPolicy(input.id, input.expectedConfigRevision);
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

    async tick(): Promise<{
      upserted: number;
      deleted: number;
      hourlyUpserted: number;
      hourlyDeleted: number;
      alertsEvaluated: number;
      alertsNotified: number;
    }> {
      const nowMs = now().getTime();
      const rebuilt = await rebuildWindow({ days: 2, nowMs });
      const hourlyRebuilt = await rebuildHourlyWindow({
        hours: RELIABILITY_REBUILD_DEFAULT_HOURS,
        nowMs,
      });
      const cutoff = utcDateString(nowMs - RELIABILITY_RETENTION_DAYS * MS_PER_DAY);
      const deleted = await deps.store.deleteOlderThan(cutoff);
      const hourlyCutoff = utcHourString(nowMs - RELIABILITY_HOURLY_RETENTION_HOURS * MS_PER_HOUR);
      const hourlyDeleted = await deps.store.deleteHourlyOlderThan(hourlyCutoff);
      const alerts = await processAlertPolicies(nowMs);
      return {
        upserted: rebuilt.upserted,
        deleted,
        hourlyUpserted: hourlyRebuilt.upserted,
        hourlyDeleted,
        alertsEvaluated: alerts.evaluated,
        alertsNotified: alerts.notified,
      };
    },
  };
}

export type ReliabilityService = ReturnType<typeof createReliabilityService>;
