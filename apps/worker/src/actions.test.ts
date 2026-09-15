import { describe, expect, it } from "vitest";
import { createSafeAutomationDispatcher } from "@dashboard/automations";
import { createWorkerActionExecutor } from "./actions";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const AUTOMATION_ID = "00000000-0000-4000-8000-000000000010";
const INTEGRATION_ID = "00000000-0000-4000-8000-000000000099";
const RUN_ID = "00000000-0000-4000-8000-000000000020";

describe("worker automation action executor", () => {
  it("runs ntfy.publish through the injected service and audits automation source", async () => {
    const audits: Array<Record<string, unknown>> = [];
    let published = 0;
    const dispatcher = createSafeAutomationDispatcher({
      async loadOwner() {
        return { id: OWNER_ID, status: "active", isSystemAdmin: true };
      },
      executor: createWorkerActionExecutor({
        services: {
          ntfy: {
            async publishMessage() {
              published += 1;
              return {
                status: "success",
                action: "ntfy.publish",
                resourceId: "homelab",
                occurredAt: "2026-09-15T12:00:00.000Z",
              };
            },
          },
          qbittorrent: {
            async pauseTorrents() {
              throw new Error("unused");
            },
            async resumeTorrents() {
              throw new Error("unused");
            },
          },
          sonarr: {
            async refreshSeries() {
              throw new Error("unused");
            },
            async searchEpisode() {
              throw new Error("unused");
            },
          },
          radarr: {
            async refreshMovie() {
              throw new Error("unused");
            },
            async searchMovie() {
              throw new Error("unused");
            },
          },
        },
        audit: {
          async record(event) {
            audits.push({
              action: event.action,
              metadata: event.metadata,
            });
          },
        },
      }),
    });
    const result = await dispatcher.dispatch({
      runId: RUN_ID,
      automationId: AUTOMATION_ID,
      actionType: "ntfy.publish",
      actionConfigJson: {
        integrationId: INTEGRATION_ID,
        topic: "homelab",
        message: "down",
      },
      triggerType: "event",
      ownerUserId: OWNER_ID,
    });
    expect(result).toMatchObject({ status: "succeeded", resourceId: "homelab" });
    expect(published).toBe(1);
    expect(audits[0]).toMatchObject({
      action: "ntfy.publish",
      metadata: {
        source: "automation",
        automationId: AUTOMATION_ID,
        runId: RUN_ID,
        resourceId: "homelab",
      },
    });
    expect(JSON.stringify(audits)).not.toMatch(/token|password|cookie/iu);
  });

  it("does not call ntfy when the action is manual-only", async () => {
    let published = 0;
    const dispatcher = createSafeAutomationDispatcher({
      async loadOwner() {
        return { id: OWNER_ID, status: "active", isSystemAdmin: true };
      },
      executor: createWorkerActionExecutor({
        services: {
          ntfy: {
            async publishMessage() {
              published += 1;
              throw new Error("should not run");
            },
          },
          qbittorrent: {
            async pauseTorrents() {
              throw new Error("unused");
            },
            async resumeTorrents() {
              throw new Error("unused");
            },
          },
          sonarr: {
            async refreshSeries() {
              throw new Error("unused");
            },
            async searchEpisode() {
              throw new Error("unused");
            },
          },
          radarr: {
            async refreshMovie() {
              throw new Error("unused");
            },
            async searchMovie() {
              throw new Error("unused");
            },
          },
        },
      }),
    });
    await expect(
      dispatcher.dispatch({
        runId: RUN_ID,
        automationId: AUTOMATION_ID,
        actionType: "seerr.approve",
        actionConfigJson: { integrationId: INTEGRATION_ID },
        triggerType: "event",
        ownerUserId: OWNER_ID,
      }),
    ).resolves.toEqual({ status: "denied", errorCode: "MANUAL_ONLY" });
    expect(published).toBe(0);
  });
});
