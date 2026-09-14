import { describe, expect, it, vi } from "vitest";
import type { AppDto, AppService } from "@dashboard/apps";
import type { DockerService } from "@dashboard/docker";
import type { JellyfinService } from "@dashboard/jellyfin";
import type { SynologyService } from "@dashboard/synology";
import { createDashboardServiceStatusService } from "./service-status";

const jellyfinId = "11111111-1111-4111-8111-111111111111";
const synologyId = "22222222-2222-4222-8222-222222222222";

function actor(permissions: readonly string[]) {
  return {
    userId: "00000000-0000-4000-8000-000000000099",
    subject: {
      status: "active" as const,
      isSystemAdmin: false,
      directPermissions: [...permissions],
    },
  };
}

describe("service status collectors", () => {
  it("shows Jellyfin and hides Synology without using generic integration.list", async () => {
    const integrations = { list: vi.fn() };
    const service = createDashboardServiceStatusService({
      apps: {
        list: vi.fn(async () => {
          throw new Error("apps should not be listed without app.read");
        }),
      } as unknown as AppService,
      docker: {
        permissions: () => ({
          canRead: false,
          canLogs: false,
          canStart: false,
          canStop: false,
          canRestart: false,
          canManage: false,
        }),
        listIntegrations: vi.fn(async () => {
          throw new Error("docker list should not run");
        }),
      } as unknown as DockerService,
      synology: {
        permissions: () => ({ canRead: false, canManageAuth: false }),
        listIntegrations: vi.fn(async () => {
          throw new Error("synology list should not run");
        }),
        getOverview: vi.fn(async () => {
          throw new Error("synology overview should not run");
        }),
      } as unknown as SynologyService,
      jellyfin: {
        permissions: () => ({ canRead: true, canManage: false }),
        listIntegrations: vi.fn(async () => [{ id: jellyfinId, name: "Media", enabled: true }]),
        getOverview: vi.fn(async () => ({
          status: "available" as const,
          fetchedAt: "2026-09-13T00:00:00.000Z",
          server: { status: "available" as const, data: { serverName: "Media" } },
          sessions: { status: "available" as const, data: { activeCount: 0, sessions: [] } },
        })),
      } as unknown as JellyfinService,
      immich: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      beszel: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      prometheus: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      uptimeKuma: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      proxmox: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      grafana: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      ntfy: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      sonarr: { permissions: () => ({ canRead: false, canManage: false }) } as never,
    });
    const result = await service.list(
      {
        selectedSources: ["jellyfin", "synology"],
        selectedIds: [`jellyfin:${jellyfinId}`, `synology:${synologyId}`],
      },
      actor(["integration.use", "jellyfin.read"]),
    );
    expect(result.items.map((item) => item.name)).toEqual(["Media"]);
    expect(JSON.stringify(result)).not.toMatch(/synology|NAS|baseUrl|apiKey|password|SID|token/u);
    expect(integrations.list).not.toHaveBeenCalled();
  });

  it("does not leak raw integration config from a docker container row", async () => {
    const containerId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const dockerId = "33333333-3333-4333-8333-333333333333";
    const service = createDashboardServiceStatusService({
      apps: { list: vi.fn(async () => ({ items: [], nextCursor: null })) } as unknown as AppService,
      docker: {
        permissions: () => ({
          canRead: true,
          canLogs: false,
          canStart: false,
          canStop: false,
          canRestart: false,
          canManage: false,
        }),
        listIntegrations: vi.fn(async () => [{ id: dockerId, name: "Proxy", enabled: true }]),
        listContainers: vi.fn(async () => [
          {
            id: containerId,
            shortId: containerId.slice(0, 12),
            names: ["jellyfin"],
            image: "jellyfin/jellyfin",
            createdAt: "2026-09-13T00:00:00.000Z",
            state: "running" as const,
            statusText: "Up 2 hours (healthy)",
            ports: [],
            health: "healthy" as const,
            recognizedApp: null,
          },
        ]),
      } as unknown as DockerService,
      synology: { permissions: () => ({ canRead: false, canManageAuth: false }) } as never,
      jellyfin: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      immich: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      beszel: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      prometheus: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      uptimeKuma: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      proxmox: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      grafana: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      ntfy: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      sonarr: { permissions: () => ({ canRead: false, canManage: false }) } as never,
    });
    const result = await service.list({}, actor(["integration.use", "docker.read", "app.read"]));
    expect(result.items[0]).toMatchObject({
      name: "jellyfin",
      status: "up",
      sourceType: "docker",
    });
    expect(JSON.stringify(result)).not.toMatch(/baseUrl|Env|HostConfig|apiKey|trustedCaPem/u);
  });

  it("pages apps until exhaustion and resolves selected ids directly", async () => {
    const page1Id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const page2Id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const page3Id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const records: Record<string, AppDto> = {
      [page1Id]: appRecord(page1Id, "One"),
      [page2Id]: appRecord(page2Id, "Two"),
      [page3Id]: appRecord(page3Id, "Three"),
    };
    const list = vi.fn(async (_actor: unknown, input: { cursor?: string }) => {
      const pages = [page1Id, page2Id, page3Id];
      const index = input.cursor ? pages.indexOf(input.cursor) + 1 : 0;
      const id = pages[index];
      if (!id) return { items: [], nextCursor: null };
      const nextId = pages[index + 1];
      return { items: [records[id]], nextCursor: nextId ? id : null };
    });
    const get = vi.fn(async (id: string) => {
      const record = records[id];
      if (!record) throw new Error("App not found");
      return record;
    });
    const service = createDashboardServiceStatusService({
      apps: { list, get } as unknown as AppService,
      docker: {
        permissions: () => ({
          canRead: false,
          canLogs: false,
          canStart: false,
          canStop: false,
          canRestart: false,
          canManage: false,
        }),
      } as unknown as DockerService,
      synology: { permissions: () => ({ canRead: false, canManageAuth: false }) } as never,
      jellyfin: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      immich: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      beszel: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      prometheus: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      uptimeKuma: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      proxmox: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      grafana: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      ntfy: { permissions: () => ({ canRead: false, canManage: false }) } as never,
      sonarr: { permissions: () => ({ canRead: false, canManage: false }) } as never,
    });
    const listed = await service.list({}, actor(["app.read"]));
    expect(listed.items.map((item) => item.name)).toEqual(["One", "Three", "Two"]);
    expect(list).toHaveBeenCalledTimes(3);
    expect(get).not.toHaveBeenCalled();
    const selected = await service.list({ selectedIds: [`app:${page3Id}`] }, actor(["app.read"]));
    expect(selected.items.map((item) => item.name)).toEqual(["Three"]);
    expect(get).toHaveBeenCalledWith(page3Id, expect.anything());
  });
});

function appRecord(id: string, name: string): AppDto {
  const now = new Date("2026-09-13T00:00:00.000Z");
  return {
    id,
    name,
    description: null,
    url: `https://apps.invalid/${id}`,
    iconRef: null,
    color: null,
    target: "same-tab",
    tags: [],
    healthcheckEnabled: true,
    healthcheckConfig: {
      path: "/",
      method: "GET",
      timeoutMs: 5000,
      expectedStatusMin: 200,
      expectedStatusMax: 399,
    },
    healthStatus: "up",
    lastCheckedAt: now,
    lastLatencyMs: 12,
    lastHttpStatus: 200,
    lastHealthErrorCode: null,
    healthConfigRevision: 1,
    integrationId: null,
    createdAt: now,
    updatedAt: now,
  };
}
