import { TRPCError } from "@trpc/server";
import type { DockerIntegrationMetadata, DockerPermissionsView } from "@dashboard/docker";
import type { IntegrationDto } from "@dashboard/integrations";

export function isNotFoundError(error: unknown): boolean {
  if (error instanceof TRPCError && error.code === "NOT_FOUND") return true;
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; cause?: unknown };
  if (record.code === "NOT_FOUND") return true;
  return record.cause !== error && isNotFoundError(record.cause);
}

export type IntegrationDetailResolution =
  | { kind: "docker"; metadata: DockerIntegrationMetadata }
  | { kind: "generic"; integration: IntegrationDto };

export interface IntegrationDetailCaller {
  docker: {
    permissions: () => Promise<Pick<DockerPermissionsView, "canRead">>;
    integration: {
      get: (input: { integrationId: string }) => Promise<DockerIntegrationMetadata>;
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
  const permissions = await caller.docker.permissions();
  if (permissions.canRead) {
    try {
      const metadata = await caller.docker.integration.get({ integrationId: id });
      return { kind: "docker", metadata };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  const integration = await caller.integration.get({ id });
  return { kind: "generic", integration };
}
