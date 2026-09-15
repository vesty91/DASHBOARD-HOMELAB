import { describe, expect, it } from "vitest";
import { AutomationError } from "./errors";
import { evaluateAutomationTrigger } from "./evaluate";
import { parseAutomationRuleCreate } from "./schemas";
import { nextScheduleRunAt, parseTriggerConfig } from "./triggers";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const AUTOMATION_ID = "00000000-0000-4000-8000-000000000010";
const INTEGRATION_ID = "00000000-0000-4000-8000-000000000099";

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Notify down",
    ownerUserId: OWNER_ID,
    triggerType: "event" as const,
    triggerConfigJson: { eventType: "integration.status.changed" },
    actionType: "ntfy.publish" as const,
    actionConfigJson: { integrationId: INTEGRATION_ID, topic: "homelab" },
    ...overrides,
  };
}

function statusEvent(status: "available" | "unavailable" | "unknown") {
  return {
    type: "integration.status.changed" as const,
    integrationId: INTEGRATION_ID,
    integrationType: "ntfy",
    status,
    occurredAt: "2026-09-15T12:00:00.000Z",
  };
}

describe("schedule triggers", () => {
  it("accepts interval and rejects frequencies faster than one minute", () => {
    const parsed = parseTriggerConfig("schedule", { kind: "interval", everyMinutes: 15 });
    expect(parsed).toMatchObject({
      triggerType: "schedule",
      config: { kind: "interval", everyMinutes: 15 },
    });
    expect(() => parseTriggerConfig("schedule", { kind: "interval", everyMinutes: 0 })).toThrow(
      AutomationError,
    );
    const from = new Date("2026-09-15T12:00:00.000Z");
    expect(nextScheduleRunAt({ kind: "interval", everyMinutes: 15 }, from)?.toISOString()).toBe(
      "2026-09-15T12:15:00.000Z",
    );
  });

  it("accepts UTC five-field cron and rejects invalid or non-UTC cron", () => {
    const parsed = parseTriggerConfig("schedule", {
      kind: "cron",
      expression: "0 * * * *",
      timezone: "UTC",
    });
    expect(parsed.triggerType).toBe("schedule");
    expect(() =>
      parseTriggerConfig("schedule", { kind: "cron", expression: "0 * * * * *", timezone: "UTC" }),
    ).toThrow(/5 fields/i);
    expect(() =>
      parseTriggerConfig("schedule", {
        kind: "cron",
        expression: "0 * * * *",
        timezone: "Europe/Paris",
      }),
    ).toThrow(AutomationError);
    expect(() => parseTriggerConfig("schedule", { kind: "cron", expression: "@hourly" })).toThrow(
      /macros/i,
    );
    const next = nextScheduleRunAt(
      { kind: "cron", expression: "0 * * * *", timezone: "UTC" },
      new Date("2026-09-15T12:10:00.000Z"),
    );
    expect(next?.toISOString()).toBe("2026-09-15T13:00:00.000Z");
  });
});

describe("event and status-transition matching", () => {
  it("matches the configured event and skips mismatches and unknown events", () => {
    const base = {
      automationId: AUTOMATION_ID,
      triggerType: "event" as const,
      triggerConfigJson: { eventType: "integration.status.changed" },
      cooldownSeconds: 60,
    };
    expect(evaluateAutomationTrigger({ ...base, event: statusEvent("unavailable") })).toEqual({
      outcome: "match",
    });
    expect(
      evaluateAutomationTrigger({
        ...base,
        event: { ...statusEvent("unavailable"), type: "integration.data.changed" },
      }),
    ).toEqual({ outcome: "skip", reason: "mismatch" });
    expect(evaluateAutomationTrigger({ ...base, event: { type: "nope" } })).toEqual({
      outcome: "skip",
      reason: "unknown_event",
    });
    expect(() => parseTriggerConfig("event", { eventType: "board.updated" })).toThrow(
      AutomationError,
    );
  });

  it("matches status transitions and ignores unchanged status", () => {
    const base = {
      automationId: AUTOMATION_ID,
      triggerType: "status-transition" as const,
      triggerConfigJson: { from: "available", to: "unavailable" },
      cooldownSeconds: 0,
      event: statusEvent("unavailable"),
    };
    expect(evaluateAutomationTrigger({ ...base, lastObservedStatus: "available" })).toEqual({
      outcome: "match",
    });
    expect(evaluateAutomationTrigger({ ...base, lastObservedStatus: "unavailable" })).toEqual({
      outcome: "skip",
      reason: "mismatch",
    });
  });
});

describe("condition engine", () => {
  it("evaluates true and false comparisons without coercing types", () => {
    const base = {
      automationId: AUTOMATION_ID,
      triggerType: "event" as const,
      triggerConfigJson: { eventType: "integration.status.changed" },
      cooldownSeconds: 0,
      event: statusEvent("unavailable"),
    };
    expect(
      evaluateAutomationTrigger({
        ...base,
        conditionConfigJson: { op: "eq", field: "status", value: "unavailable" },
      }),
    ).toEqual({ outcome: "match" });
    expect(
      evaluateAutomationTrigger({
        ...base,
        conditionConfigJson: { op: "eq", field: "status", value: "available" },
      }),
    ).toEqual({ outcome: "skip", reason: "condition_false" });
    expect(() =>
      parseAutomationRuleCreate(
        createInput({
          conditionConfigJson: { op: "eq", field: "status", value: 12 },
        }),
      ),
    ).toThrow(/Type mismatch/i);
    expect(() =>
      parseAutomationRuleCreate(
        createInput({
          conditionConfigJson: { op: "lt", field: "status", value: 1 },
        }),
      ),
    ).toThrow(/Numeric comparison/i);
  });

  it("supports nested and/or and rejects unknown fields, operators, and huge trees", () => {
    expect(
      parseAutomationRuleCreate(
        createInput({
          conditionConfigJson: {
            op: "and",
            nodes: [
              { op: "eq", field: "status", value: "unavailable" },
              {
                op: "or",
                nodes: [
                  { op: "contains", field: "integrationType", value: "ntfy" },
                  { op: "eq", field: "integrationId", value: INTEGRATION_ID },
                ],
              },
            ],
          },
        }),
      ).conditionConfigJson,
    ).toMatchObject({ op: "and" });
    expect(() =>
      parseAutomationRuleCreate(
        createInput({ conditionConfigJson: { op: "eq", field: "payload", value: "x" } }),
      ),
    ).toThrow(/Unknown condition field/i);
    expect(() =>
      parseAutomationRuleCreate(
        createInput({ conditionConfigJson: { op: "regex", field: "status", value: "x" } }),
      ),
    ).toThrow(AutomationError);
    const deep = { op: "and", nodes: [{ op: "eq", field: "status", value: "unavailable" }] };
    let tree: Record<string, unknown> = deep;
    for (let index = 0; index < 6; index += 1) tree = { op: "and", nodes: [tree] };
    expect(() => parseAutomationRuleCreate(createInput({ conditionConfigJson: tree }))).toThrow(
      /too deep/i,
    );
  });
});

describe("cooldown and loop suppression", () => {
  it("skips cooldown and same-automation causation", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    const base = {
      automationId: AUTOMATION_ID,
      triggerType: "event" as const,
      triggerConfigJson: { eventType: "integration.status.changed" },
      cooldownSeconds: 300,
      event: statusEvent("unavailable"),
      now,
    };
    expect(
      evaluateAutomationTrigger({
        ...base,
        lastTriggeredAt: new Date("2026-09-15T11:59:00.000Z"),
      }),
    ).toEqual({ outcome: "skip", reason: "cooldown" });
    expect(
      evaluateAutomationTrigger({
        ...base,
        cooldownSeconds: 0,
        causationAutomationId: AUTOMATION_ID,
      }),
    ).toEqual({ outcome: "skip", reason: "loop" });
    expect(
      evaluateAutomationTrigger({
        ...base,
        cooldownSeconds: 0,
        lastTriggeredAt: new Date("2026-09-15T11:00:00.000Z"),
      }),
    ).toEqual({ outcome: "match" });
  });
});
