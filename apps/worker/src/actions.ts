import {
  automationActionAuditMetadata,
  type AutomationActionType,
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

export type AutomationAuditAction =
  | "ntfy.publish"
  | "qbittorrent.pause"
  | "qbittorrent.resume"
  | "sonarr.refresh-series"
  | "sonarr.search-episode"
  | "radarr.refresh-movie"
  | "radarr.search-movie";

export interface AutomationAuditSink {
  record(event: {
    actorUserId: string | null;
    action: AutomationAuditAction;
    targetType: string;
    targetId: string | null;
    outcome: "success" | "failure" | "denied";
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export interface WorkerActionServices {
  ntfy: Pick<NtfyService, "publishMessage">;
  qbittorrent: Pick<QbittorrentService, "pauseTorrents" | "resumeTorrents">;
  sonarr: Pick<SonarrService, "refreshSeries" | "searchEpisode">;
  radarr: Pick<RadarrService, "refreshMovie" | "searchMovie">;
}

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

export function createWorkerActionExecutor(options: {
  services: WorkerActionServices;
  audit?: AutomationAuditSink;
}): SafeAutomationActionExecutor {
  return {
    async execute({ owner, dispatch }) {
      const actor = actorFromOwner(owner);
      const actionType: AutomationActionType = dispatch.actionType;
      const config = dispatch.actionConfigJson;
      let result: SafeActionResult;
      switch (actionType) {
        case "ntfy.publish": {
          const input = parseOrThrow(ntfyPublishInputSchema.safeParse(config));
          result = await options.services.ntfy.publishMessage(input, actor);
          break;
        }
        case "qbittorrent.pause": {
          const input = parseOrThrow(qbittorrentTorrentActionInputSchema.safeParse(config));
          result = await options.services.qbittorrent.pauseTorrents(input, actor);
          break;
        }
        case "qbittorrent.resume": {
          const input = parseOrThrow(qbittorrentTorrentActionInputSchema.safeParse(config));
          result = await options.services.qbittorrent.resumeTorrents(input, actor);
          break;
        }
        case "sonarr.refresh-series": {
          const input = parseOrThrow(sonarrRefreshSeriesInputSchema.safeParse(config));
          result = await options.services.sonarr.refreshSeries(input, actor);
          break;
        }
        case "sonarr.search-episode": {
          const input = parseOrThrow(sonarrSearchEpisodeInputSchema.safeParse(config));
          result = await options.services.sonarr.searchEpisode(input, actor);
          break;
        }
        case "radarr.refresh-movie": {
          const input = parseOrThrow(radarrRefreshMovieInputSchema.safeParse(config));
          result = await options.services.radarr.refreshMovie(input, actor);
          break;
        }
        case "radarr.search-movie": {
          const input = parseOrThrow(radarrSearchMovieInputSchema.safeParse(config));
          result = await options.services.radarr.searchMovie(input, actor);
          break;
        }
        case "proxmox.start":
        case "proxmox.shutdown":
        case "proxmox.reboot":
        case "seerr.approve":
        case "seerr.decline":
          return { status: "denied", errorCode: "MANUAL_ONLY" };
        default: {
          const _never: never = actionType;
          return _never;
        }
      }
      const mapped = toDispatch(result);
      if (options.audit && mapped.status === "succeeded") {
        const integrationId =
          typeof config.integrationId === "string" ? config.integrationId : dispatch.automationId;
        await options.audit.record({
          actorUserId: owner.id,
          action: actionType as AutomationAuditAction,
          targetType: "automation",
          targetId: dispatch.automationId,
          outcome: "success",
          metadata: automationActionAuditMetadata({
            automationId: dispatch.automationId,
            runId: dispatch.runId,
            actionType,
            integrationId,
            resourceId: result.resourceId,
            result: result.status === "accepted" ? "accepted" : "success",
          }),
        });
      }
      return mapped;
    },
  };
}
