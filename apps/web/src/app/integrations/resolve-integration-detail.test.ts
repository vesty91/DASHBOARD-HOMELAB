import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { IntegrationDto } from "@dashboard/integrations";
import { resolveIntegrationDetail } from "./resolve-integration-detail";

const DOCKER_ID = "11111111-1111-4111-8111-111111111111";
const SYNOLOGY_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function genericIntegration(overrides: Partial<IntegrationDto> = {}): IntegrationDto {
  return {
    id: OTHER_ID,
    type: "http-health",
    name: "Health",
    baseUrl: "https://health.example/",
    enabled: true,
    config: { verifyTls: true },
    status: "unknown",
    lastCheckedAt: null,
    configRevision: 1,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    definitionAvailable: true,
    capabilities: [],
    secrets: {},
    ...overrides,
  };
}

const synologyDenied = {
  permissions: async () => ({ canRead: false as const }),
  integration: {
    get: async () => {
      throw new Error("synology unused");
    },
  },
};

const jellyfinDenied = {
  permissions: async () => ({ canRead: false as const }),
  integration: {
    get: async () => {
      throw new Error("jellyfin unused");
    },
  },
};

const immichDenied = {
  permissions: async () => ({ canRead: false as const }),
  integration: {
    get: async () => {
      throw new Error("immich unused");
    },
  },
};

const beszelDenied = {
  permissions: async () => ({ canRead: false as const }),
  integration: {
    get: async () => {
      throw new Error("beszel unused");
    },
  },
};

const prometheusDenied = {
  permissions: async () => ({ canRead: false as const }),
  integration: {
    get: async () => {
      throw new Error("prometheus unused");
    },
  },
};

const uptimeKumaDenied = {
  permissions: async () => ({ canRead: false as const }),
  integration: {
    get: async () => {
      throw new Error("uptime-kuma unused");
    },
  },
};

const proxmoxDenied = {
  permissions: async () => ({ canRead: false as const }),
  integration: {
    get: async () => {
      throw new Error("proxmox unused");
    },
  },
};

const grafanaDenied = {
  permissions: async () => ({ canRead: false as const }),
  integration: {
    get: async () => {
      throw new Error("grafana unused");
    },
  },
};

const ntfyDenied = {
  permissions: async () => ({ canRead: false as const }),
  integration: {
    get: async () => {
      throw new Error("ntfy unused");
    },
  },
};

const prowlarrDenied = {
  permissions: async () => ({ canRead: false as const }),
  integration: {
    get: async () => {
      throw new Error("prowlarr unused");
    },
  },
};

const qbittorrentDenied = {
  permissions: async () => ({ canRead: false as const }),
  integration: {
    get: async () => {
      throw new Error("qbittorrent unused");
    },
  },
};

const seerrDenied = {
  permissions: async () => ({ canRead: false as const }),
  integration: {
    get: async () => {
      throw new Error("seerr unused");
    },
  },
};

const customApiDenied = {
  permissions: async () => ({ canRead: false as const }),
  integration: {
    get: async () => {
      throw new Error("custom-api unused");
    },
  },
};

const radarrDenied = {
  permissions: async () => ({ canRead: false as const }),
  integration: {
    get: async () => {
      throw new Error("radarr unused");
    },
  },
};

const sonarrDenied = {
  permissions: async () => ({ canRead: false as const }),
  integration: {
    get: async () => {
      throw new Error("sonarr unused");
    },
  },
};

describe("resolveIntegrationDetail", () => {
  it("lets a delegated Docker reader open the page by name without integration.get", async () => {
    const integrationGet = vi.fn();
    const resolved = await resolveIntegrationDetail(DOCKER_ID, {
      docker: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => ({ id: DOCKER_ID, name: "Proxy maison", enabled: true }),
        },
      },
      synology: synologyDenied,
      jellyfin: jellyfinDenied,
      immich: immichDenied,
      beszel: beszelDenied,
      prometheus: prometheusDenied,
      uptimeKuma: uptimeKumaDenied,
      proxmox: proxmoxDenied,
      grafana: grafanaDenied,
      ntfy: ntfyDenied,
      prowlarr: prowlarrDenied,
      qbittorrent: qbittorrentDenied,
      seerr: seerrDenied,
      customApi: customApiDenied,
      radarr: radarrDenied,
      sonarr: sonarrDenied,
      integration: { get: integrationGet },
    });
    expect(resolved).toEqual({
      kind: "docker",
      metadata: { id: DOCKER_ID, name: "Proxy maison", enabled: true },
    });
    expect(integrationGet).not.toHaveBeenCalled();
  });

  it("lets a delegated Beszel reader open the page by name without integration.get", async () => {
    const integrationGet = vi.fn();
    const resolved = await resolveIntegrationDetail("44444444-4444-4444-8444-444444444444", {
      docker: {
        permissions: async () => ({ canRead: false }),
        integration: {
          get: async () => {
            throw new Error("docker unused");
          },
        },
      },
      synology: synologyDenied,
      jellyfin: jellyfinDenied,
      immich: immichDenied,
      beszel: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => ({
            id: "44444444-4444-4444-8444-444444444444",
            name: "Hosts Lab",
            enabled: true,
          }),
        },
      },
      prometheus: prometheusDenied,
      uptimeKuma: uptimeKumaDenied,
      proxmox: proxmoxDenied,
      grafana: grafanaDenied,
      ntfy: ntfyDenied,
      prowlarr: prowlarrDenied,
      qbittorrent: qbittorrentDenied,
      seerr: seerrDenied,
      customApi: customApiDenied,
      radarr: radarrDenied,
      sonarr: sonarrDenied,
      integration: { get: integrationGet },
    });
    expect(resolved).toEqual({
      kind: "beszel",
      metadata: {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Hosts Lab",
        enabled: true,
      },
    });
    expect(integrationGet).not.toHaveBeenCalled();
  });

  it("lets a delegated Uptime Kuma reader open the page by name without integration.get", async () => {
    const integrationGet = vi.fn();
    const resolved = await resolveIntegrationDetail("55555555-5555-4555-8555-555555555555", {
      docker: {
        permissions: async () => ({ canRead: false }),
        integration: {
          get: async () => {
            throw new Error("docker unused");
          },
        },
      },
      synology: synologyDenied,
      jellyfin: jellyfinDenied,
      immich: immichDenied,
      beszel: beszelDenied,
      prometheus: prometheusDenied,
      uptimeKuma: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => ({
            id: "55555555-5555-4555-8555-555555555555",
            name: "Uptime Lab",
            enabled: true,
          }),
        },
      },
      proxmox: proxmoxDenied,
      grafana: grafanaDenied,
      ntfy: ntfyDenied,
      prowlarr: prowlarrDenied,
      qbittorrent: qbittorrentDenied,
      seerr: seerrDenied,
      customApi: customApiDenied,
      radarr: radarrDenied,
      sonarr: sonarrDenied,
      integration: { get: integrationGet },
    });
    expect(resolved).toEqual({
      kind: "uptime-kuma",
      metadata: {
        id: "55555555-5555-4555-8555-555555555555",
        name: "Uptime Lab",
        enabled: true,
      },
    });
    expect(integrationGet).not.toHaveBeenCalled();
  });

  it("lets a delegated Proxmox reader open the page by name without integration.get", async () => {
    const integrationGet = vi.fn();
    const resolved = await resolveIntegrationDetail("77777777-7777-4777-8777-777777777777", {
      docker: {
        permissions: async () => ({ canRead: false }),
        integration: {
          get: async () => {
            throw new Error("docker unused");
          },
        },
      },
      synology: synologyDenied,
      jellyfin: jellyfinDenied,
      immich: immichDenied,
      beszel: beszelDenied,
      prometheus: prometheusDenied,
      uptimeKuma: uptimeKumaDenied,
      proxmox: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => ({
            id: "77777777-7777-4777-8777-777777777777",
            name: "PVE Lab",
            enabled: true,
          }),
        },
      },
      grafana: grafanaDenied,
      ntfy: ntfyDenied,
      prowlarr: prowlarrDenied,
      qbittorrent: qbittorrentDenied,
      seerr: seerrDenied,
      customApi: customApiDenied,
      radarr: radarrDenied,
      sonarr: sonarrDenied,
      integration: { get: integrationGet },
    });
    expect(resolved).toEqual({
      kind: "proxmox",
      metadata: {
        id: "77777777-7777-4777-8777-777777777777",
        name: "PVE Lab",
        enabled: true,
      },
    });
    expect(integrationGet).not.toHaveBeenCalled();
  });

  it("lets a delegated Grafana reader open the page by name without integration.get", async () => {
    const integrationGet = vi.fn();
    const resolved = await resolveIntegrationDetail("88888888-8888-4888-8888-888888888888", {
      docker: {
        permissions: async () => ({ canRead: false }),
        integration: {
          get: async () => {
            throw new Error("docker unused");
          },
        },
      },
      synology: synologyDenied,
      jellyfin: jellyfinDenied,
      immich: immichDenied,
      beszel: beszelDenied,
      prometheus: prometheusDenied,
      uptimeKuma: uptimeKumaDenied,
      proxmox: proxmoxDenied,
      grafana: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => ({
            id: "88888888-8888-4888-8888-888888888888",
            name: "Grafana Lab",
            enabled: true,
          }),
        },
      },
      ntfy: ntfyDenied,
      prowlarr: prowlarrDenied,
      qbittorrent: qbittorrentDenied,
      seerr: seerrDenied,
      customApi: customApiDenied,
      radarr: radarrDenied,
      sonarr: sonarrDenied,
      integration: { get: integrationGet },
    });
    expect(resolved).toEqual({
      kind: "grafana",
      metadata: {
        id: "88888888-8888-4888-8888-888888888888",
        name: "Grafana Lab",
        enabled: true,
      },
    });
    expect(integrationGet).not.toHaveBeenCalled();
  });

  it("lets a delegated ntfy reader open the page by name without integration.get", async () => {
    const integrationGet = vi.fn();
    const resolved = await resolveIntegrationDetail("99999999-9999-4999-8999-999999999999", {
      docker: {
        permissions: async () => ({ canRead: false }),
        integration: {
          get: async () => {
            throw new Error("docker unused");
          },
        },
      },
      synology: synologyDenied,
      jellyfin: jellyfinDenied,
      immich: immichDenied,
      beszel: beszelDenied,
      prometheus: prometheusDenied,
      uptimeKuma: uptimeKumaDenied,
      proxmox: proxmoxDenied,
      grafana: grafanaDenied,
      ntfy: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => ({
            id: "99999999-9999-4999-8999-999999999999",
            name: "ntfy Lab",
            enabled: true,
          }),
        },
      },
      prowlarr: prowlarrDenied,
      qbittorrent: qbittorrentDenied,
      seerr: seerrDenied,
      customApi: customApiDenied,
      radarr: radarrDenied,
      sonarr: sonarrDenied,
      integration: { get: integrationGet },
    });
    expect(resolved).toEqual({
      kind: "ntfy",
      metadata: {
        id: "99999999-9999-4999-8999-999999999999",
        name: "ntfy Lab",
        enabled: true,
      },
    });
    expect(integrationGet).not.toHaveBeenCalled();
  });

  it("lets a delegated Prowlarr reader open the page by name without integration.get", async () => {
    const integrationGet = vi.fn();
    const resolved = await resolveIntegrationDetail("cccccccc-cccc-4ccc-8ccc-cccccccccccc", {
      docker: {
        permissions: async () => ({ canRead: false }),
        integration: {
          get: async () => {
            throw new Error("docker unused");
          },
        },
      },
      synology: synologyDenied,
      jellyfin: jellyfinDenied,
      immich: immichDenied,
      beszel: beszelDenied,
      prometheus: prometheusDenied,
      uptimeKuma: uptimeKumaDenied,
      proxmox: proxmoxDenied,
      grafana: grafanaDenied,
      ntfy: ntfyDenied,
      prowlarr: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => ({
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            name: "Prowlarr Lab",
            enabled: true,
          }),
        },
      },
      qbittorrent: qbittorrentDenied,
      seerr: seerrDenied,
      customApi: customApiDenied,
      radarr: radarrDenied,
      sonarr: sonarrDenied,
      integration: { get: integrationGet },
    });
    expect(resolved).toEqual({
      kind: "prowlarr",
      metadata: {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "Prowlarr Lab",
        enabled: true,
      },
    });
    expect(integrationGet).not.toHaveBeenCalled();
  });

  it("lets a delegated qBittorrent reader open the page by name without integration.get", async () => {
    const integrationGet = vi.fn();
    const resolved = await resolveIntegrationDetail("dddddddd-dddd-4ddd-8ddd-dddddddddddd", {
      docker: {
        permissions: async () => ({ canRead: false }),
        integration: {
          get: async () => {
            throw new Error("docker unused");
          },
        },
      },
      synology: synologyDenied,
      jellyfin: jellyfinDenied,
      immich: immichDenied,
      beszel: beszelDenied,
      prometheus: prometheusDenied,
      uptimeKuma: uptimeKumaDenied,
      proxmox: proxmoxDenied,
      grafana: grafanaDenied,
      ntfy: ntfyDenied,
      prowlarr: prowlarrDenied,
      qbittorrent: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => ({
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            name: "qBittorrent Lab",
            enabled: true,
          }),
        },
      },
      seerr: seerrDenied,
      customApi: customApiDenied,
      radarr: radarrDenied,
      sonarr: sonarrDenied,
      integration: { get: integrationGet },
    });
    expect(resolved).toEqual({
      kind: "qbittorrent",
      metadata: {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        name: "qBittorrent Lab",
        enabled: true,
      },
    });
    expect(integrationGet).not.toHaveBeenCalled();
  });

  it("lets a delegated Seerr reader open the page by name without integration.get", async () => {
    const integrationGet = vi.fn();
    const resolved = await resolveIntegrationDetail("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", {
      docker: {
        permissions: async () => ({ canRead: false }),
        integration: {
          get: async () => {
            throw new Error("docker unused");
          },
        },
      },
      synology: synologyDenied,
      jellyfin: jellyfinDenied,
      immich: immichDenied,
      beszel: beszelDenied,
      prometheus: prometheusDenied,
      uptimeKuma: uptimeKumaDenied,
      proxmox: proxmoxDenied,
      grafana: grafanaDenied,
      ntfy: ntfyDenied,
      prowlarr: prowlarrDenied,
      qbittorrent: qbittorrentDenied,
      seerr: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => ({
            id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            name: "Seerr Lab",
            enabled: true,
          }),
        },
      },
      customApi: customApiDenied,
      radarr: radarrDenied,
      sonarr: sonarrDenied,
      integration: { get: integrationGet },
    });
    expect(resolved).toEqual({
      kind: "seerr",
      metadata: {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        name: "Seerr Lab",
        enabled: true,
      },
    });
    expect(integrationGet).not.toHaveBeenCalled();
  });

  it("lets a delegated Custom API reader open the page by name without integration.get", async () => {
    const integrationGet = vi.fn();
    const resolved = await resolveIntegrationDetail("ffffffff-ffff-4fff-8fff-ffffffffffff", {
      docker: {
        permissions: async () => ({ canRead: false }),
        integration: {
          get: async () => {
            throw new Error("docker unused");
          },
        },
      },
      synology: synologyDenied,
      jellyfin: jellyfinDenied,
      immich: immichDenied,
      beszel: beszelDenied,
      prometheus: prometheusDenied,
      uptimeKuma: uptimeKumaDenied,
      proxmox: proxmoxDenied,
      grafana: grafanaDenied,
      ntfy: ntfyDenied,
      prowlarr: prowlarrDenied,
      qbittorrent: qbittorrentDenied,
      seerr: seerrDenied,
      customApi: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => ({
            id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            name: "API Lab",
            enabled: true,
            endpoints: [{ key: "status", label: "Status", path: "/status" }],
          }),
        },
      },
      radarr: radarrDenied,
      sonarr: sonarrDenied,
      integration: { get: integrationGet },
    });
    expect(resolved).toEqual({
      kind: "custom-api",
      metadata: {
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        name: "API Lab",
        enabled: true,
        endpoints: [{ key: "status", label: "Status", path: "/status" }],
      },
    });
    expect(integrationGet).not.toHaveBeenCalled();
  });

  it("lets a delegated Radarr reader open the page by name without integration.get", async () => {
    const integrationGet = vi.fn();
    const resolved = await resolveIntegrationDetail("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
      docker: {
        permissions: async () => ({ canRead: false }),
        integration: {
          get: async () => {
            throw new Error("docker unused");
          },
        },
      },
      synology: synologyDenied,
      jellyfin: jellyfinDenied,
      immich: immichDenied,
      beszel: beszelDenied,
      prometheus: prometheusDenied,
      uptimeKuma: uptimeKumaDenied,
      proxmox: proxmoxDenied,
      grafana: grafanaDenied,
      ntfy: ntfyDenied,
      prowlarr: prowlarrDenied,
      qbittorrent: qbittorrentDenied,
      seerr: seerrDenied,
      customApi: customApiDenied,
      radarr: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => ({
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            name: "Radarr Lab",
            enabled: true,
          }),
        },
      },
      sonarr: sonarrDenied,
      integration: { get: integrationGet },
    });
    expect(resolved).toEqual({
      kind: "radarr",
      metadata: {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        name: "Radarr Lab",
        enabled: true,
      },
    });
    expect(integrationGet).not.toHaveBeenCalled();
  });

  it("lets a delegated Sonarr reader open the page by name without integration.get", async () => {
    const integrationGet = vi.fn();
    const resolved = await resolveIntegrationDetail("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
      docker: {
        permissions: async () => ({ canRead: false }),
        integration: {
          get: async () => {
            throw new Error("docker unused");
          },
        },
      },
      synology: synologyDenied,
      jellyfin: jellyfinDenied,
      immich: immichDenied,
      beszel: beszelDenied,
      prometheus: prometheusDenied,
      uptimeKuma: uptimeKumaDenied,
      proxmox: proxmoxDenied,
      grafana: grafanaDenied,
      ntfy: ntfyDenied,
      prowlarr: prowlarrDenied,
      qbittorrent: qbittorrentDenied,
      seerr: seerrDenied,
      customApi: customApiDenied,
      radarr: radarrDenied,
      sonarr: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => ({
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            name: "Sonarr Lab",
            enabled: true,
          }),
        },
      },
      integration: { get: integrationGet },
    });
    expect(resolved).toEqual({
      kind: "sonarr",
      metadata: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Sonarr Lab",
        enabled: true,
      },
    });
    expect(integrationGet).not.toHaveBeenCalled();
  });

  it("lets a delegated Prometheus reader open the page by name without integration.get", async () => {
    const integrationGet = vi.fn();
    const resolved = await resolveIntegrationDetail("66666666-6666-4666-8666-666666666666", {
      docker: {
        permissions: async () => ({ canRead: false }),
        integration: {
          get: async () => {
            throw new Error("docker unused");
          },
        },
      },
      synology: synologyDenied,
      jellyfin: jellyfinDenied,
      immich: immichDenied,
      beszel: beszelDenied,
      prometheus: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => ({
            id: "66666666-6666-4666-8666-666666666666",
            name: "Prom Lab",
            enabled: true,
          }),
        },
      },
      uptimeKuma: uptimeKumaDenied,
      proxmox: proxmoxDenied,
      grafana: grafanaDenied,
      ntfy: ntfyDenied,
      prowlarr: prowlarrDenied,
      qbittorrent: qbittorrentDenied,
      seerr: seerrDenied,
      customApi: customApiDenied,
      radarr: radarrDenied,
      sonarr: sonarrDenied,
      integration: { get: integrationGet },
    });
    expect(resolved).toEqual({
      kind: "prometheus",
      metadata: {
        id: "66666666-6666-4666-8666-666666666666",
        name: "Prom Lab",
        enabled: true,
      },
    });
    expect(integrationGet).not.toHaveBeenCalled();
  });

  it("lets a delegated Synology reader open the page by name without integration.get", async () => {
    const integrationGet = vi.fn();
    const resolved = await resolveIntegrationDetail(SYNOLOGY_ID, {
      docker: {
        permissions: async () => ({ canRead: false }),
        integration: {
          get: async () => {
            throw new Error("docker unused");
          },
        },
      },
      synology: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => ({ id: SYNOLOGY_ID, name: "NAS Lab", enabled: true }),
        },
      },
      jellyfin: jellyfinDenied,
      immich: immichDenied,
      beszel: beszelDenied,
      prometheus: prometheusDenied,
      uptimeKuma: uptimeKumaDenied,
      proxmox: proxmoxDenied,
      grafana: grafanaDenied,
      ntfy: ntfyDenied,
      prowlarr: prowlarrDenied,
      qbittorrent: qbittorrentDenied,
      seerr: seerrDenied,
      customApi: customApiDenied,
      radarr: radarrDenied,
      sonarr: sonarrDenied,
      integration: { get: integrationGet },
    });
    expect(resolved).toEqual({
      kind: "synology",
      metadata: { id: SYNOLOGY_ID, name: "NAS Lab", enabled: true },
    });
    expect(integrationGet).not.toHaveBeenCalled();
  });

  it("falls back to the generic integration view only after Docker and Synology NOT_FOUND", async () => {
    const resolved = await resolveIntegrationDetail(OTHER_ID, {
      docker: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({ code: "NOT_FOUND", message: "Définition Docker introuvable" });
          },
        },
      },
      synology: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({ code: "NOT_FOUND", message: "Définition Synology introuvable" });
          },
        },
      },
      jellyfin: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({ code: "NOT_FOUND", message: "Définition Jellyfin introuvable" });
          },
        },
      },
      immich: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({ code: "NOT_FOUND", message: "Définition Immich introuvable" });
          },
        },
      },
      beszel: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({ code: "NOT_FOUND", message: "Définition Beszel introuvable" });
          },
        },
      },
      prometheus: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Définition Prometheus introuvable",
            });
          },
        },
      },
      uptimeKuma: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Définition Uptime Kuma introuvable",
            });
          },
        },
      },
      proxmox: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Définition Proxmox introuvable",
            });
          },
        },
      },
      grafana: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Définition Grafana introuvable",
            });
          },
        },
      },
      ntfy: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Définition ntfy introuvable",
            });
          },
        },
      },
      prowlarr: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Définition Prowlarr introuvable",
            });
          },
        },
      },
      qbittorrent: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Définition qBittorrent introuvable",
            });
          },
        },
      },
      seerr: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Définition Seerr introuvable",
            });
          },
        },
      },
      customApi: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Définition Custom API introuvable",
            });
          },
        },
      },
      radarr: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Définition Radarr introuvable",
            });
          },
        },
      },
      sonarr: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Définition Sonarr introuvable",
            });
          },
        },
      },
      integration: { get: async () => genericIntegration() },
    });
    expect(resolved).toEqual({ kind: "generic", integration: genericIntegration() });
  });

  it("does not swallow non-NOT_FOUND Docker errors", async () => {
    await expect(
      resolveIntegrationDetail(DOCKER_ID, {
        docker: {
          permissions: async () => ({ canRead: true }),
          integration: {
            get: async () => {
              throw new TRPCError({ code: "TIMEOUT", message: "slow" });
            },
          },
        },
        synology: synologyDenied,
        jellyfin: jellyfinDenied,
        immich: immichDenied,
        beszel: beszelDenied,
        prometheus: prometheusDenied,
        uptimeKuma: uptimeKumaDenied,
        proxmox: proxmoxDenied,
        grafana: grafanaDenied,
        ntfy: ntfyDenied,
        prowlarr: prowlarrDenied,
        qbittorrent: qbittorrentDenied,
        seerr: seerrDenied,
        customApi: customApiDenied,
        radarr: radarrDenied,
        sonarr: sonarrDenied,
        integration: {
          get: async () => {
            throw new Error("should not be called");
          },
        },
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("uses integration.get when the caller cannot read Docker or Synology", async () => {
    const dockerGet = vi.fn();
    const synologyGet = vi.fn();
    const resolved = await resolveIntegrationDetail(OTHER_ID, {
      docker: {
        permissions: async () => ({ canRead: false }),
        integration: { get: dockerGet },
      },
      synology: {
        permissions: async () => ({ canRead: false }),
        integration: { get: synologyGet },
      },
      jellyfin: {
        permissions: async () => ({ canRead: false }),
        integration: { get: vi.fn() },
      },
      immich: {
        permissions: async () => ({ canRead: false }),
        integration: { get: vi.fn() },
      },
      beszel: {
        permissions: async () => ({ canRead: false }),
        integration: { get: vi.fn() },
      },
      prometheus: {
        permissions: async () => ({ canRead: false }),
        integration: { get: vi.fn() },
      },
      uptimeKuma: {
        permissions: async () => ({ canRead: false }),
        integration: { get: vi.fn() },
      },
      proxmox: {
        permissions: async () => ({ canRead: false }),
        integration: { get: vi.fn() },
      },
      grafana: {
        permissions: async () => ({ canRead: false }),
        integration: { get: vi.fn() },
      },
      ntfy: ntfyDenied,
      prowlarr: prowlarrDenied,
      qbittorrent: qbittorrentDenied,
      seerr: seerrDenied,
      customApi: customApiDenied,
      radarr: radarrDenied,
      sonarr: sonarrDenied,
      integration: { get: async () => genericIntegration() },
    });
    expect(resolved.kind).toBe("generic");
    expect(dockerGet).not.toHaveBeenCalled();
    expect(synologyGet).not.toHaveBeenCalled();
  });

  it("does not expose non-Docker metadata to a Docker-only reader", async () => {
    await expect(
      resolveIntegrationDetail(OTHER_ID, {
        docker: {
          permissions: async () => ({ canRead: true }),
          integration: {
            get: async () => {
              throw new TRPCError({ code: "NOT_FOUND", message: "Définition Docker introuvable" });
            },
          },
        },
        synology: synologyDenied,
        jellyfin: jellyfinDenied,
        immich: immichDenied,
        beszel: beszelDenied,
        prometheus: prometheusDenied,
        uptimeKuma: uptimeKumaDenied,
        proxmox: proxmoxDenied,
        grafana: grafanaDenied,
        ntfy: ntfyDenied,
        prowlarr: prowlarrDenied,
        qbittorrent: qbittorrentDenied,
        seerr: seerrDenied,
        customApi: customApiDenied,
        radarr: radarrDenied,
        sonarr: sonarrDenied,
        integration: {
          get: async () => {
            throw new TRPCError({ code: "FORBIDDEN", message: "Permission denied" });
          },
        },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
