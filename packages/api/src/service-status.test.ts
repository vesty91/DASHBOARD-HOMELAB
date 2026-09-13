import { describe, expect, it, vi } from "vitest";
import type { AppService } from "@dashboard/apps";
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
    });
    const result = await service.list({}, actor(["integration.use", "docker.read", "app.read"]));
    expect(result.items[0]).toMatchObject({
      name: "jellyfin",
      status: "up",
      sourceType: "docker",
    });
    expect(JSON.stringify(result)).not.toMatch(/baseUrl|Env|HostConfig|apiKey|trustedCaPem/u);
  });
});
