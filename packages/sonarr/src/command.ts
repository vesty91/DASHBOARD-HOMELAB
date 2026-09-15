import { IntegrationError } from "@dashboard/integrations";

export const SONARR_COMMAND_PATH = "/api/v3/command";
export const SONARR_RESOURCE_ID_MAX = 2_147_483_647;

export type SonarrQueuedCommand =
  | { readonly name: "RefreshSeries"; readonly seriesId: number }
  | { readonly name: "EpisodeSearch"; readonly episodeIds: readonly [number] };

export function assertSonarrResourceId(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > SONARR_RESOURCE_ID_MAX)
    throw new IntegrationError("VALIDATION_ERROR", "Invalid Sonarr resource id");
  return value;
}

export function sonarrRefreshSeriesCommand(seriesId: number): SonarrQueuedCommand {
  return { name: "RefreshSeries", seriesId: assertSonarrResourceId(seriesId) };
}

export function sonarrEpisodeSearchCommand(episodeId: number): SonarrQueuedCommand {
  return { name: "EpisodeSearch", episodeIds: [assertSonarrResourceId(episodeId)] };
}

export function sonarrCommandResourceId(command: SonarrQueuedCommand): string {
  switch (command.name) {
    case "RefreshSeries":
      return `series:${command.seriesId}`;
    case "EpisodeSearch":
      return `episode:${command.episodeIds[0]}`;
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}

export function serializeSonarrCommand(command: SonarrQueuedCommand): string {
  switch (command.name) {
    case "RefreshSeries":
      return JSON.stringify({ name: "RefreshSeries", seriesId: command.seriesId });
    case "EpisodeSearch":
      return JSON.stringify({ name: "EpisodeSearch", episodeIds: [command.episodeIds[0]] });
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}

export function isSonarrCommandPath(pathname: string): boolean {
  return pathname === SONARR_COMMAND_PATH;
}
