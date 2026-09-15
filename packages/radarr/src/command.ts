import { IntegrationError } from "@dashboard/integrations";

export const RADARR_COMMAND_PATH = "/api/v3/command";
export const RADARR_RESOURCE_ID_MAX = 2_147_483_647;

export type RadarrQueuedCommand =
  | { readonly name: "RefreshMovie"; readonly movieIds: readonly [number] }
  | { readonly name: "MoviesSearch"; readonly movieIds: readonly [number] };

export function assertRadarrResourceId(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > RADARR_RESOURCE_ID_MAX)
    throw new IntegrationError("VALIDATION_ERROR", "Invalid Radarr resource id");
  return value;
}

export function radarrRefreshMovieCommand(movieId: number): RadarrQueuedCommand {
  return { name: "RefreshMovie", movieIds: [assertRadarrResourceId(movieId)] };
}

export function radarrMoviesSearchCommand(movieId: number): RadarrQueuedCommand {
  return { name: "MoviesSearch", movieIds: [assertRadarrResourceId(movieId)] };
}

export function radarrCommandResourceId(command: RadarrQueuedCommand): string {
  switch (command.name) {
    case "RefreshMovie":
      return `movie:${command.movieIds[0]}`;
    case "MoviesSearch":
      return `search:${command.movieIds[0]}`;
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}

export function serializeRadarrCommand(command: RadarrQueuedCommand): string {
  switch (command.name) {
    case "RefreshMovie":
      return JSON.stringify({ name: "RefreshMovie", movieIds: [command.movieIds[0]] });
    case "MoviesSearch":
      return JSON.stringify({ name: "MoviesSearch", movieIds: [command.movieIds[0]] });
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}

export function isRadarrCommandPath(pathname: string): boolean {
  return pathname === RADARR_COMMAND_PATH;
}
