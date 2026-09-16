import { describe, expect, it } from "vitest";
import { createStatusPageService } from "@dashboard/status-pages";
import { createSqliteClient } from "./client/sqlite";
import { migrateSqlite } from "./migrations";
import { createSqliteRepositories } from "./repositories/sqlite";
import { createSqliteIntegrationStore } from "./integration-runtime";
import { createSqliteStatusPageStore } from "./status-page-runtime";

describe("status page runtime", () => {
  it("persists pages, enforces revision conflicts, and projects public DTO safely", async () => {
    const client = createSqliteClient(":memory:");
    await migrateSqlite(client.sqlite);
    try {
      expect(
        client.sqlite.prepare("SELECT schema_version FROM server_settings WHERE id='global'").get(),
      ).toMatchObject({ schema_version: 10 });

      const users = createSqliteRepositories(client);
      const owner = await users.users.create({ username: "status-owner" });
      const integrations = createSqliteIntegrationStore(client.sqlite);
      const integration = await integrations.create({
        type: "custom-api",
        name: "Probe",
        baseUrl: "https://secret.internal:8443",
        enabled: true,
        config: {},
        createdBy: owner.id,
      });
      await integrations.persistConnectionResult(integration.id, 1, "available");

      const store = createSqliteStatusPageStore(client);
      const service = createStatusPageService({ store });
      const actor = {
        userId: owner.id,
        subject: {
          status: "active" as const,
          isSystemAdmin: true,
        },
      };

      const created = await service.create(
        {
          name: "Lab",
          slug: "lab-status",
          description: null,
          visibility: "private",
          enabled: true,
        },
        actor,
      );
      expect(created.visibility).toBe("private");
      await expect(service.getPublicBySlug("lab-status")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      const withService = await service.replaceServices(
        {
          statusPageId: created.id,
          expectedConfigRevision: 1,
          services: [
            {
              sourceIntegrationId: integration.id,
              displayName: "Probe",
              description: null,
              sortOrder: 0,
              showIncidentHistory: true,
            },
          ],
        },
        actor,
      );
      expect(withService.services[0]?.status).toBe("operational");

      await expect(
        service.update(
          {
            id: created.id,
            expectedConfigRevision: 1,
            name: "Lab",
            slug: "lab-status",
            description: null,
            visibility: "public",
            enabled: true,
          },
          actor,
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      const published = await service.update(
        {
          id: created.id,
          expectedConfigRevision: withService.configRevision,
          name: "Lab",
          slug: "lab-status",
          description: null,
          visibility: "public",
          enabled: true,
        },
        actor,
      );
      const publicDto = await service.getPublicBySlug("lab-status");
      expect(publicDto.overallStatus).toBe("operational");
      expect(JSON.stringify(publicDto)).not.toContain(integration.id);
      expect(JSON.stringify(publicDto)).not.toContain("secret.internal");
      expect(published.configRevision).toBe(withService.configRevision + 1);
    } finally {
      client.close();
    }
  });
});
