import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { IntegrationDto } from "@dashboard/integrations";
import { resolveIntegrationDetail } from "./resolve-integration-detail";

const DOCKER_ID = "11111111-1111-4111-8111-111111111111";
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
      integration: { get: integrationGet },
    });
    expect(resolved).toEqual({
      kind: "docker",
      metadata: { id: DOCKER_ID, name: "Proxy maison", enabled: true },
    });
    expect(integrationGet).not.toHaveBeenCalled();
  });

  it("falls back to the generic integration view only after Docker NOT_FOUND", async () => {
    const resolved = await resolveIntegrationDetail(OTHER_ID, {
      docker: {
        permissions: async () => ({ canRead: true }),
        integration: {
          get: async () => {
            throw new TRPCError({ code: "NOT_FOUND", message: "Définition Docker introuvable" });
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
        integration: {
          get: async () => {
            throw new Error("should not be called");
          },
        },
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("uses integration.get when the caller cannot read Docker", async () => {
    const dockerGet = vi.fn();
    const resolved = await resolveIntegrationDetail(OTHER_ID, {
      docker: {
        permissions: async () => ({ canRead: false }),
        integration: { get: dockerGet },
      },
      integration: { get: async () => genericIntegration() },
    });
    expect(resolved.kind).toBe("generic");
    expect(dockerGet).not.toHaveBeenCalled();
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
        integration: {
          get: async () => {
            throw new TRPCError({ code: "FORBIDDEN", message: "Permission denied" });
          },
        },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
