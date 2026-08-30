const STARTABLE_STATES = new Set(["created", "exited"]);

export function isDockerStartableState(state: string): boolean {
  return STARTABLE_STATES.has(state);
}
