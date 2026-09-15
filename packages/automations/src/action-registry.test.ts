import { describe, expect, it } from "vitest";
import {
  assertAutomationActionAllowed,
  getAutomationActionPolicy,
  isAutomationAllowedAction,
  listAutomationAllowedActions,
} from "./action-registry";
import { AutomationError } from "./errors";
import { createSafeAutomationDispatcher } from "./safe-dispatch";
import { AUTOMATION_ACTION_TYPES } from "./types";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const AUTOMATION_ID = "00000000-0000-4000-8000-000000000010";
const INTEGRATION_ID = "00000000-0000-4000-8000-000000000099";

function dispatchInput(actionType: (typeof AUTOMATION_ACTION_TYPES)[number]) {
  return {
    runId: "00000000-0000-4000-8000-000000000020",
    automationId: AUTOMATION_ID,
    actionType,
    actionConfigJson: { integrationId: INTEGRATION_ID, topic: "homelab" },
    triggerType: "event" as const,
    ownerUserId: OWNER_ID,
  };
}

describe("automation action registry", () => {
  it("allows the Phase 22 low-risk actions and denies high-risk by default", () => {
    expect(isAutomationAllowedAction("ntfy.publish")).toBe(true);
    expect(isAutomationAllowedAction("qbittorrent.pause")).toBe(true);
    expect(isAutomationAllowedAction("qbittorrent.resume")).toBe(true);
    expect(isAutomationAllowedAction("sonarr.refresh-series")).toBe(true);
    expect(isAutomationAllowedAction("sonarr.search-episode")).toBe(true);
    expect(isAutomationAllowedAction("radarr.refresh-movie")).toBe(true);
    expect(isAutomationAllowedAction("radarr.search-movie")).toBe(true);
    expect(isAutomationAllowedAction("proxmox.start")).toBe(false);
    expect(isAutomationAllowedAction("proxmox.shutdown")).toBe(false);
    expect(isAutomationAllowedAction("proxmox.reboot")).toBe(false);
    expect(isAutomationAllowedAction("seerr.approve")).toBe(false);
    expect(isAutomationAllowedAction("seerr.decline")).toBe(false);
    expect(() => assertAutomationActionAllowed("proxmox.shutdown")).toThrow(AutomationError);
    expect(listAutomationAllowedActions()).not.toContain("proxmox.shutdown");
    expect(getAutomationActionPolicy("ntfy.publish").requiresHumanConfirmation).toBe(false);
    expect(getAutomationActionPolicy("proxmox.reboot").requiresHumanConfirmation).toBe(true);
    for (const action of AUTOMATION_ACTION_TYPES) {
      expect(getAutomationActionPolicy(action).actionType).toBe(action);
    }
  });

  it("denies manual-only actions before the executor runs", async () => {
    let executed = 0;
    const dispatcher = createSafeAutomationDispatcher({
      async loadOwner() {
        return { id: OWNER_ID, status: "active", isSystemAdmin: true };
      },
      executor: {
        async execute() {
          executed += 1;
          return { status: "succeeded" };
        },
      },
    });
    await expect(dispatcher.dispatch(dispatchInput("proxmox.shutdown"))).resolves.toEqual({
      status: "denied",
      errorCode: "MANUAL_ONLY",
    });
    expect(executed).toBe(0);
  });

  it("denies when the live owner lost automation.run", async () => {
    let executed = 0;
    const dispatcher = createSafeAutomationDispatcher({
      async loadOwner() {
        return {
          id: OWNER_ID,
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["ntfy.publish"],
        };
      },
      executor: {
        async execute() {
          executed += 1;
          return { status: "succeeded" };
        },
      },
    });
    await expect(dispatcher.dispatch(dispatchInput("ntfy.publish"))).resolves.toMatchObject({
      status: "denied",
      errorCode: "DENIED_PERMISSION",
    });
    expect(executed).toBe(0);
  });

  it("maps specialized permission failures after the executor runs", async () => {
    const dispatcher = createSafeAutomationDispatcher({
      async loadOwner() {
        return { id: OWNER_ID, status: "active", isSystemAdmin: true };
      },
      executor: {
        async execute() {
          throw Object.assign(new Error("forbidden"), { code: "FORBIDDEN" });
        },
      },
    });
    await expect(dispatcher.dispatch(dispatchInput("ntfy.publish"))).resolves.toEqual({
      status: "denied",
      errorCode: "FORBIDDEN",
    });
  });

  it("maps rate limits and stale revisions without a side-effect success", async () => {
    const dispatcher = createSafeAutomationDispatcher({
      async loadOwner() {
        return { id: OWNER_ID, status: "active", isSystemAdmin: true };
      },
      executor: {
        async execute() {
          throw Object.assign(new Error("limited"), { code: "RATE_LIMITED" });
        },
      },
    });
    await expect(dispatcher.dispatch(dispatchInput("qbittorrent.pause"))).resolves.toEqual({
      status: "skipped",
      errorCode: "RATE_LIMITED",
    });
  });
});
