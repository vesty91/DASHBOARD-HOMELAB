import { TRPCError } from "@trpc/server";
import { hasPermission } from "@dashboard/permissions";
import { IntegrationError } from "@dashboard/integrations";
import {
  EVENT_RESOURCE_ID,
  REALTIME_TICKET_MAX_SUBSCRIPTIONS,
  normalizeRealtimeSubscriptions,
  type RealtimeSubscription,
} from "@dashboard/events";
import { z } from "zod";
import type { ApiContext } from "./index";

export const SPECIALIZED_INTEGRATION_TYPES = [
  "docker",
  "synology",
  "jellyfin",
  "immich",
  "beszel",
  "prometheus",
  "uptime-kuma",
  "proxmox",
  "grafana",
  "ntfy",
  "sonarr",
] as const;

export type SpecializedIntegrationType = (typeof SPECIALIZED_INTEGRATION_TYPES)[number];

const specializedTypeSet = new Set<string>(SPECIALIZED_INTEGRATION_TYPES);

export const realtimeTicketInputSchema = z.object({
  boardIds: z.array(EVENT_RESOURCE_ID).max(REALTIME_TICKET_MAX_SUBSCRIPTIONS).optional(),
  integrationIds: z.array(EVENT_RESOURCE_ID).max(REALTIME_TICKET_MAX_SUBSCRIPTIONS).optional(),
  runtime: z.boolean().optional(),
});

export type RealtimeTicketInput = z.infer<typeof realtimeTicketInputSchema>;

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

async function probeSpecializedMetadata(
  load: () => Promise<unknown>,
): Promise<"granted" | "missing" | "denied"> {
  try {
    await load();
    return "granted";
  } catch (error) {
    if (error instanceof IntegrationError && error.code === "NOT_FOUND") return "missing";
    return "denied";
  }
}

export async function canSubscribeIntegrationRealtime(
  ctx: ApiContext,
  integrationId: string,
): Promise<boolean> {
  const actor = ctx.actor;
  const probes: Array<{ canRead: boolean; load: () => Promise<unknown> }> = [
    {
      canRead: ctx.docker.permissions(actor).canRead,
      load: () => ctx.docker.getIntegrationMetadata(integrationId, actor),
    },
    {
      canRead: ctx.synology.permissions(actor).canRead,
      load: () => ctx.synology.getIntegrationMetadata(integrationId, actor),
    },
    {
      canRead: ctx.jellyfin.permissions(actor).canRead,
      load: () => ctx.jellyfin.getIntegrationMetadata(integrationId, actor),
    },
    {
      canRead: ctx.immich.permissions(actor).canRead,
      load: () => ctx.immich.getIntegrationMetadata(integrationId, actor),
    },
    {
      canRead: ctx.beszel.permissions(actor).canRead,
      load: () => ctx.beszel.getIntegrationMetadata(integrationId, actor),
    },
    {
      canRead: ctx.prometheus.permissions(actor).canRead,
      load: () => ctx.prometheus.getIntegrationMetadata(integrationId, actor),
    },
    {
      canRead: ctx.uptimeKuma.permissions(actor).canRead,
      load: () => ctx.uptimeKuma.getIntegrationMetadata(integrationId, actor),
    },
    {
      canRead: ctx.proxmox.permissions(actor).canRead,
      load: () => ctx.proxmox.getIntegrationMetadata(integrationId, actor),
    },
    {
      canRead: ctx.grafana.permissions(actor).canRead,
      load: () => ctx.grafana.getIntegrationMetadata(integrationId, actor),
    },
    {
      canRead: ctx.ntfy.permissions(actor).canRead,
      load: () => ctx.ntfy.getIntegrationMetadata(integrationId, actor),
    },
    {
      canRead: ctx.sonarr.permissions(actor).canRead,
      load: () => ctx.sonarr.getIntegrationMetadata(integrationId, actor),
    },
  ];
  for (const probe of probes) {
    if (!probe.canRead) continue;
    const result = await probeSpecializedMetadata(probe.load);
    if (result === "granted") return true;
    if (result === "denied") return false;
  }
  try {
    const dto = await ctx.integrations.get(integrationId, actor);
    return !specializedTypeSet.has(dto.type);
  } catch {
    return false;
  }
}

export async function resolveRealtimeSubscriptions(
  ctx: ApiContext,
  input: RealtimeTicketInput,
): Promise<RealtimeSubscription[]> {
  const boardIds = uniqueIds(input.boardIds ?? []);
  const integrationIds = uniqueIds(input.integrationIds ?? []);
  const requested = (input.runtime === true ? 1 : 0) + boardIds.length + integrationIds.length;
  if (requested > REALTIME_TICKET_MAX_SUBSCRIPTIONS) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Too many realtime subscriptions" });
  }
  const subscriptions: RealtimeSubscription[] = [];
  if (
    input.runtime === true &&
    ctx.actor.subject &&
    hasPermission(ctx.actor.subject, "settings.read")
  ) {
    subscriptions.push({ kind: "runtime" });
  }
  for (const boardId of boardIds) {
    if (await ctx.boards.canSubscribeRealtime(boardId, ctx.actor)) {
      subscriptions.push({ kind: "board", id: boardId });
    }
  }
  for (const integrationId of integrationIds) {
    if (await canSubscribeIntegrationRealtime(ctx, integrationId)) {
      subscriptions.push({ kind: "integration", id: integrationId });
    }
  }
  return normalizeRealtimeSubscriptions(subscriptions);
}
