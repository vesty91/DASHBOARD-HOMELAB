const UNSET_INTEGRATION_ID = "00000000-0000-4000-8000-000000000000";
const SERVICE_STATUS_ID =
  /^(?:docker|synology|jellyfin|immich|beszel|uptime-kuma|prometheus):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/iu;
export const MAX_LIVE_INTEGRATION_IDS = 49;

export function collectLiveIntegrationIds(
  items: readonly { config: unknown }[],
  serviceStatusViews: Readonly<
    Record<string, { status: string; items?: readonly { integrationId: string | null }[] }>
  > = {},
): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    const config = item.config;
    if (!config || typeof config !== "object") continue;
    const record = config as { integrationId?: unknown; selectedIds?: unknown };
    if (typeof record.integrationId === "string" && record.integrationId !== UNSET_INTEGRATION_ID) {
      ids.add(record.integrationId);
    }
    if (Array.isArray(record.selectedIds)) {
      for (const selected of record.selectedIds) {
        if (typeof selected !== "string") continue;
        const match = SERVICE_STATUS_ID.exec(selected);
        if (match?.[1]) ids.add(match[1]);
      }
    }
  }
  for (const view of Object.values(serviceStatusViews)) {
    if (view.status !== "ready" || !view.items) continue;
    for (const entry of view.items) {
      if (typeof entry.integrationId === "string" && entry.integrationId.length > 0) {
        ids.add(entry.integrationId);
      }
    }
  }
  return [...ids].slice(0, MAX_LIVE_INTEGRATION_IDS);
}
