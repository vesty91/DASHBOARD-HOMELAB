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
  listDailyReliabilitySchema,
  rebuildReliabilitySchema,
  type ListDailyReliabilityInput,
  type RebuildReliabilityInput,
} from "./schemas";
import type { DailyReliabilityRollup } from "./types";

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

    const rows: DailyReliabilityRollup[] = [];
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

  return {
    permissions(actor: ReliabilityActor) {
      return {
        canRead: Boolean(
          actor.subject &&
          actor.subject.status === "active" &&
          hasPermission(actor.subject, "reliability.read"),
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

    async tick(): Promise<{ upserted: number; deleted: number }> {
      const rebuilt = await rebuildWindow({ days: 2 });
      const cutoff = utcDateString(now().getTime() - RELIABILITY_RETENTION_DAYS * MS_PER_DAY);
      const deleted = await deps.store.deleteOlderThan(cutoff);
      return { upserted: rebuilt.upserted, deleted };
    },
  };
}

export type ReliabilityService = ReturnType<typeof createReliabilityService>;
