export const JELLYFIN_BOARD_REFRESH_MS = 10_000;

export function shouldPollJellyfinBoard(views: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(views).length > 0;
}
