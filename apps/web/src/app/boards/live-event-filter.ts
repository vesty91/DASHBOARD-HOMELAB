export function shouldRefreshFromLiveEvent(
  type: string,
  data: string,
  integrationIds: readonly string[],
): boolean {
  if (!type.startsWith("integration.")) return true;
  if (!data) return false;
  try {
    const payload = JSON.parse(data) as { integrationId?: unknown };
    if (typeof payload.integrationId !== "string") return false;
    return integrationIds.includes(payload.integrationId);
  } catch {
    return false;
  }
}
