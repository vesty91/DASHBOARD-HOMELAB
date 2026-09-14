import { TRPCError } from "@trpc/server";
import type { DockerIntegrationMetadata, DockerPermissionsView } from "@dashboard/docker";
import type { IntegrationDto } from "@dashboard/integrations";
import type { BeszelIntegrationMetadata, BeszelPermissionsView } from "@dashboard/beszel";
import type {
  PrometheusIntegrationMetadata,
  PrometheusPermissionsView,
} from "@dashboard/prometheus";
import type {
  UptimeKumaIntegrationMetadata,
  UptimeKumaPermissionsView,
} from "@dashboard/uptime-kuma";
import type { GrafanaIntegrationMetadata, GrafanaPermissionsView } from "@dashboard/grafana";
import type { NtfyIntegrationMetadata, NtfyPermissionsView } from "@dashboard/ntfy";
import type { RadarrIntegrationMetadata, RadarrPermissionsView } from "@dashboard/radarr";
import type { SonarrIntegrationMetadata, SonarrPermissionsView } from "@dashboard/sonarr";
import type { ProxmoxIntegrationMetadata, ProxmoxPermissionsView } from "@dashboard/proxmox";
import type { ImmichIntegrationMetadata, ImmichPermissionsView } from "@dashboard/immich";
import type { JellyfinIntegrationMetadata, JellyfinPermissionsView } from "@dashboard/jellyfin";
import type { SynologyIntegrationMetadata, SynologyPermissionsView } from "@dashboard/synology";

export function isNotFoundError(error: unknown): boolean {
  if (error instanceof TRPCError && error.code === "NOT_FOUND") return true;
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; cause?: unknown };
  if (record.code === "NOT_FOUND") return true;
  return record.cause !== error && isNotFoundError(record.cause);
}

export type IntegrationDetailResolution =
  | { kind: "docker"; metadata: DockerIntegrationMetadata }
  | { kind: "synology"; metadata: SynologyIntegrationMetadata }
  | { kind: "jellyfin"; metadata: JellyfinIntegrationMetadata }
  | { kind: "immich"; metadata: ImmichIntegrationMetadata }
  | { kind: "beszel"; metadata: BeszelIntegrationMetadata }
  | { kind: "prometheus"; metadata: PrometheusIntegrationMetadata }
  | { kind: "uptime-kuma"; metadata: UptimeKumaIntegrationMetadata }
  | { kind: "proxmox"; metadata: ProxmoxIntegrationMetadata }
  | { kind: "grafana"; metadata: GrafanaIntegrationMetadata }
  | { kind: "ntfy"; metadata: NtfyIntegrationMetadata }
  | { kind: "radarr"; metadata: RadarrIntegrationMetadata }
  | { kind: "sonarr"; metadata: SonarrIntegrationMetadata }
  | { kind: "generic"; integration: IntegrationDto };

export interface IntegrationDetailCaller {
  docker: {
    permissions: () => Promise<Pick<DockerPermissionsView, "canRead">>;
    integration: {
      get: (input: { integrationId: string }) => Promise<DockerIntegrationMetadata>;
    };
  };
  synology: {
    permissions: () => Promise<Pick<SynologyPermissionsView, "canRead">>;
    integration: {
      get: (input: { integrationId: string }) => Promise<SynologyIntegrationMetadata>;
    };
  };
  jellyfin: {
    permissions: () => Promise<Pick<JellyfinPermissionsView, "canRead">>;
    integration: {
      get: (input: { integrationId: string }) => Promise<JellyfinIntegrationMetadata>;
    };
  };
  immich: {
    permissions: () => Promise<Pick<ImmichPermissionsView, "canRead">>;
    integration: {
      get: (input: { integrationId: string }) => Promise<ImmichIntegrationMetadata>;
    };
  };
  beszel: {
    permissions: () => Promise<Pick<BeszelPermissionsView, "canRead">>;
    integration: {
      get: (input: { integrationId: string }) => Promise<BeszelIntegrationMetadata>;
    };
  };
  prometheus: {
    permissions: () => Promise<Pick<PrometheusPermissionsView, "canRead">>;
    integration: {
      get: (input: { integrationId: string }) => Promise<PrometheusIntegrationMetadata>;
    };
  };
  uptimeKuma: {
    permissions: () => Promise<Pick<UptimeKumaPermissionsView, "canRead">>;
    integration: {
      get: (input: { integrationId: string }) => Promise<UptimeKumaIntegrationMetadata>;
    };
  };
  proxmox: {
    permissions: () => Promise<Pick<ProxmoxPermissionsView, "canRead">>;
    integration: {
      get: (input: { integrationId: string }) => Promise<ProxmoxIntegrationMetadata>;
    };
  };
  grafana: {
    permissions: () => Promise<Pick<GrafanaPermissionsView, "canRead">>;
    integration: {
      get: (input: { integrationId: string }) => Promise<GrafanaIntegrationMetadata>;
    };
  };
  ntfy: {
    permissions: () => Promise<Pick<NtfyPermissionsView, "canRead">>;
    integration: {
      get: (input: { integrationId: string }) => Promise<NtfyIntegrationMetadata>;
    };
  };
  radarr: {
    permissions: () => Promise<Pick<RadarrPermissionsView, "canRead">>;
    integration: {
      get: (input: { integrationId: string }) => Promise<RadarrIntegrationMetadata>;
    };
  };
  sonarr: {
    permissions: () => Promise<Pick<SonarrPermissionsView, "canRead">>;
    integration: {
      get: (input: { integrationId: string }) => Promise<SonarrIntegrationMetadata>;
    };
  };
  integration: {
    get: (input: { id: string }) => Promise<IntegrationDto>;
  };
}

export async function resolveIntegrationDetail(
  id: string,
  caller: IntegrationDetailCaller,
): Promise<IntegrationDetailResolution> {
  const dockerPermissions = await caller.docker.permissions();
  if (dockerPermissions.canRead) {
    try {
      const metadata = await caller.docker.integration.get({ integrationId: id });
      return { kind: "docker", metadata };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  const synologyPermissions = await caller.synology.permissions();
  if (synologyPermissions.canRead) {
    try {
      const metadata = await caller.synology.integration.get({ integrationId: id });
      return { kind: "synology", metadata };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  const jellyfinPermissions = await caller.jellyfin.permissions();
  if (jellyfinPermissions.canRead) {
    try {
      const metadata = await caller.jellyfin.integration.get({ integrationId: id });
      return { kind: "jellyfin", metadata };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  const immichPermissions = await caller.immich.permissions();
  if (immichPermissions.canRead) {
    try {
      const metadata = await caller.immich.integration.get({ integrationId: id });
      return { kind: "immich", metadata };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  const beszelPermissions = await caller.beszel.permissions();
  if (beszelPermissions.canRead) {
    try {
      const metadata = await caller.beszel.integration.get({ integrationId: id });
      return { kind: "beszel", metadata };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  const prometheusPermissions = await caller.prometheus.permissions();
  if (prometheusPermissions.canRead) {
    try {
      const metadata = await caller.prometheus.integration.get({ integrationId: id });
      return { kind: "prometheus", metadata };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  const uptimeKumaPermissions = await caller.uptimeKuma.permissions();
  if (uptimeKumaPermissions.canRead) {
    try {
      const metadata = await caller.uptimeKuma.integration.get({ integrationId: id });
      return { kind: "uptime-kuma", metadata };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  const proxmoxPermissions = await caller.proxmox.permissions();
  if (proxmoxPermissions.canRead) {
    try {
      const metadata = await caller.proxmox.integration.get({ integrationId: id });
      return { kind: "proxmox", metadata };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  const grafanaPermissions = await caller.grafana.permissions();
  if (grafanaPermissions.canRead) {
    try {
      const metadata = await caller.grafana.integration.get({ integrationId: id });
      return { kind: "grafana", metadata };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  const ntfyPermissions = await caller.ntfy.permissions();
  if (ntfyPermissions.canRead) {
    try {
      const metadata = await caller.ntfy.integration.get({ integrationId: id });
      return { kind: "ntfy", metadata };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  const radarrPermissions = await caller.radarr.permissions();
  if (radarrPermissions.canRead) {
    try {
      const metadata = await caller.radarr.integration.get({ integrationId: id });
      return { kind: "radarr", metadata };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  const sonarrPermissions = await caller.sonarr.permissions();
  if (sonarrPermissions.canRead) {
    try {
      const metadata = await caller.sonarr.integration.get({ integrationId: id });
      return { kind: "sonarr", metadata };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  const integration = await caller.integration.get({ id });
  return { kind: "generic", integration };
}
