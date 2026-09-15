import { describe, expect, it } from "vitest";
import { evaluateAutomationOwner } from "./access";
import { AutomationError } from "./errors";
import { parseAutomationRuleCreate, parseAutomationRuleUpdate } from "./schemas";

const INTEGRATION_ID = "00000000-0000-4000-8000-000000000099";
const OWNER_ID = "00000000-0000-4000-8000-000000000001";

function validCreate() {
  return {
    name: "Notify down",
    ownerUserId: OWNER_ID,
    triggerType: "event" as const,
    triggerConfigJson: { eventType: "integration.status.changed" },
    actionType: "ntfy.publish" as const,
    actionConfigJson: { integrationId: INTEGRATION_ID, topic: "homelab" },
  };
}

describe("automation schemas", () => {
  it("accepts a closed trigger and action without secrets", () => {
    const parsed = parseAutomationRuleCreate(validCreate());
    expect(parsed.actionType).toBe("ntfy.publish");
    expect(parsed.triggerType).toBe("event");
  });

  it("rejects unknown trigger, unknown action and unknown fields", () => {
    expect(() => parseAutomationRuleCreate({ ...validCreate(), triggerType: "webhook" })).toThrow(
      AutomationError,
    );
    expect(() =>
      parseAutomationRuleCreate({ ...validCreate(), actionType: "custom-api.post" }),
    ).toThrow(AutomationError);
    expect(() => parseAutomationRuleCreate({ ...validCreate(), extra: true })).toThrow(
      AutomationError,
    );
  });

  it("rejects secret-like config keys and oversized JSON", () => {
    expect(() =>
      parseAutomationRuleCreate({
        ...validCreate(),
        actionConfigJson: { integrationId: INTEGRATION_ID, apiKey: "nopenope" },
      }),
    ).toThrow(/secrets/i);
    expect(() =>
      parseAutomationRuleCreate({
        ...validCreate(),
        triggerConfigJson: { blob: "x".repeat(20_000) },
      }),
    ).toThrow(/size limit/i);
  });

  it("requires a UUID integrationId in action config", () => {
    expect(() =>
      parseAutomationRuleCreate({
        ...validCreate(),
        actionConfigJson: { topic: "homelab" },
      }),
    ).toThrow(/integrationId/i);
  });

  it("requires expectedConfigRevision on update", () => {
    expect(() => parseAutomationRuleUpdate({ name: "x" })).toThrow(AutomationError);
    const parsed = parseAutomationRuleUpdate({
      expectedConfigRevision: 1,
      name: "Renamed",
    });
    expect(parsed.name).toBe("Renamed");
  });
});

describe("automation owner evaluation", () => {
  it("denies missing, disabled and permissionless owners without a snapshot", () => {
    expect(() => evaluateAutomationOwner(null, "run")).toThrow(/missing/i);
    expect(() =>
      evaluateAutomationOwner(
        {
          id: OWNER_ID,
          status: "disabled",
          isSystemAdmin: false,
          directPermissions: ["automation.run"],
        },
        "run",
      ),
    ).toThrow(/disabled/i);
    expect(() =>
      evaluateAutomationOwner(
        {
          id: OWNER_ID,
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["automation.read"],
        },
        "run",
      ),
    ).toThrow(AutomationError);
    evaluateAutomationOwner(
      { id: OWNER_ID, status: "active", isSystemAdmin: true, directPermissions: [] },
      "run",
    );
  });
});
