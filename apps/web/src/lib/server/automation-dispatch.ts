import "server-only";
import {
  automationActionAuditMetadata,
  createSafeAutomationDispatcher,
  type AutomationOwnerRecord,
  type SafeAutomationActionExecutor,
} from "@dashboard/automations";
import type { IntegrationActor, SafeActionResult } from "@dashboard/integrations";
import { ntfyPublishInputSchema, type NtfyService } from "@dashboard/ntfy";
import {
  qbittorrentTorrentActionInputSchema,
  type QbittorrentService,
} from "@dashboard/qbittorrent";
import {
  radarrRefreshMovieInputSchema,
  radarrSearchMovieInputSchema,
  type RadarrService,
} from "@dashboard/radarr";
import {
  sonarrRefreshSeriesInputSchema,
  sonarrSearchEpisodeInputSchema,
  type SonarrService,
} from "@dashboard/sonarr";

function actorFromOwner(owner: AutomationOwnerRecord): IntegrationActor {
  return { userId: owner.id, subject: owner };
}

function toDispatch(result: SafeActionResult) {
  if (result.status === "failed")
    return { status: "failed" as const, errorCode: "ACTION_FAILED", resourceId: result.resourceId };
  return { status: "succeeded" as const, resourceId: result.resourceId };
}

function parseOrThrow<T>(parsed: { success: true; data: T } | { success: false }): T {
  if (!parsed.success)
    throw Object.assign(new Error("Invalid action config"), { code: "VALIDATION_ERROR" });
  return parsed.data;
}

export function createWebAutomationDispatcher(options: {
  loadOwner: (userId: string) => Promise<AutomationOwnerRecord | null>;
  ntfy: Pick<NtfyService, "publishMessage">;
  qbittorrent: Pick<QbittorrentService, "pauseTorrents" | "resumeTorrents">;
  sonarr: Pick<SonarrService, "refreshSeries" | "searchEpisode">;
  radarr: Pick<RadarrService, "refreshMovie" | "searchMovie">;
  audit?: (event: {
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    outcome: "success" | "failure" | "denied";
    metadata: Record<string, unknown>;
  }) => Promise<void>;
}) {
  const executor: SafeAutomationActionExecutor = {
    async execute({ owner, dispatch }) {
      const actor = actorFromOwner(owner);
      const config = dispatch.actionConfigJson;
      let result: SafeActionResult;
      switch (dispatch.actionType) {
        case "ntfy.publish": {
          const input = parseOrThrow(ntfyPublishInputSchema.safeParse(config));
          result = await options.ntfy.publishMessage(input, actor);
          break;
        }
        case "qbittorrent.pause": {
          const input = parseOrThrow(qbittorrentTorrentActionInputSchema.safeParse(config));
          result = await options.qbittorrent.pauseTorrents(input, actor);
          break;
        }
        case "qbittorrent.resume": {
          const input = parseOrThrow(qbittorrentTorrentActionInputSchema.safeParse(config));
          result = await options.qbittorrent.resumeTorrents(input, actor);
          break;
        }
        case "sonarr.refresh-series": {
          const input = parseOrThrow(sonarrRefreshSeriesInputSchema.safeParse(config));
          result = await options.sonarr.refreshSeries(input, actor);
          break;
        }
        case "sonarr.search-episode": {
          const input = parseOrThrow(sonarrSearchEpisodeInputSchema.safeParse(config));
          result = await options.sonarr.searchEpisode(input, actor);
          break;
        }
        case "radarr.refresh-movie": {
          const input = parseOrThrow(radarrRefreshMovieInputSchema.safeParse(config));
          result = await options.radarr.refreshMovie(input, actor);
          break;
        }
        case "radarr.search-movie": {
          const input = parseOrThrow(radarrSearchMovieInputSchema.safeParse(config));
          result = await options.radarr.searchMovie(input, actor);
          break;
        }
        case "proxmox.start":
        case "proxmox.shutdown":
        case "proxmox.reboot":
        case "seerr.approve":
        case "seerr.decline":
          return { status: "denied", errorCode: "MANUAL_ONLY" };
        default: {
          const _never: never = dispatch.actionType;
          return _never;
        }
      }
      const mapped = toDispatch(result);
      if (options.audit && mapped.status === "succeeded") {
        const integrationId =
          typeof config.integrationId === "string" ? config.integrationId : dispatch.automationId;
        await options.audit({
          actorUserId: owner.id,
          action: dispatch.actionType,
          targetType: "automation",
          targetId: dispatch.automationId,
          outcome: "success",
          metadata: automationActionAuditMetadata({
            automationId: dispatch.automationId,
            runId: dispatch.runId,
            actionType: dispatch.actionType,
            integrationId,
            resourceId: result.resourceId,
            result: result.status === "accepted" ? "accepted" : "success",
          }),
        });
      }
      return mapped;
    },
  };
  return createSafeAutomationDispatcher({
    loadOwner: options.loadOwner,
    executor,
  });
}
