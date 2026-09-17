import { describe, expect, it } from "vitest";
import { decideSloAlert, formatSloAlertNotification } from "./slo-alerts";

const policy = {
  enabled: true,
  cooldownSeconds: 3600,
  notifyOnRecovery: true,
};

describe("decideSloAlert", () => {
  it("does not notify when policy disabled", () => {
    const decision = decideSloAlert({
      sloId: "slo-1",
      policy: { ...policy, enabled: false },
      previous: null,
      nextState: "critical",
      burnRate: 20,
      nowMs: 1_000_000,
    });
    expect(decision.shouldNotify).toBe(false);
    expect(decision.action).toBe("none");
  });

  it("notifies warning on first transition", () => {
    const decision = decideSloAlert({
      sloId: "slo-1",
      policy,
      previous: null,
      nextState: "warning",
      burnRate: 2,
      nowMs: 1_000_000,
    });
    expect(decision.action).toBe("notify-warning");
    expect(decision.shouldNotify).toBe(true);
    expect(decision.nextRuntime.lastNotifiedState).toBe("warning");
  });

  it("notifies critical on first transition", () => {
    const decision = decideSloAlert({
      sloId: "slo-1",
      policy,
      previous: null,
      nextState: "critical",
      burnRate: 20,
      nowMs: 1_000_000,
    });
    expect(decision.action).toBe("notify-critical");
  });

  it("suppresses duplicate within cooldown", () => {
    const decision = decideSloAlert({
      sloId: "slo-1",
      policy,
      previous: {
        sloId: "slo-1",
        lastState: "warning",
        lastNotifiedState: "warning",
        lastNotifiedAt: new Date(1_000_000),
        lastTransitionAt: new Date(1_000_000),
        lastBurnRate: 2,
        updatedAt: new Date(1_000_000),
      },
      nextState: "warning",
      burnRate: 2.1,
      nowMs: 1_000_000 + 60_000,
    });
    expect(decision.shouldNotify).toBe(false);
    expect(decision.cooldownSuppressed).toBe(true);
  });

  it("re-notifies after cooldown", () => {
    const decision = decideSloAlert({
      sloId: "slo-1",
      policy,
      previous: {
        sloId: "slo-1",
        lastState: "warning",
        lastNotifiedState: "warning",
        lastNotifiedAt: new Date(1_000_000),
        lastTransitionAt: new Date(1_000_000),
        lastBurnRate: 2,
        updatedAt: new Date(1_000_000),
      },
      nextState: "warning",
      burnRate: 2.1,
      nowMs: 1_000_000 + 3_600_000,
    });
    expect(decision.action).toBe("notify-warning");
    expect(decision.shouldNotify).toBe(true);
  });

  it("notifies recovery only when prior alert existed", () => {
    const withAlert = decideSloAlert({
      sloId: "slo-1",
      policy,
      previous: {
        sloId: "slo-1",
        lastState: "critical",
        lastNotifiedState: "critical",
        lastNotifiedAt: new Date(1_000_000),
        lastTransitionAt: new Date(1_000_000),
        lastBurnRate: 20,
        updatedAt: new Date(1_000_000),
      },
      nextState: "healthy",
      burnRate: 0,
      nowMs: 2_000_000,
    });
    expect(withAlert.action).toBe("notify-recovery");

    const withoutAlert = decideSloAlert({
      sloId: "slo-1",
      policy,
      previous: {
        sloId: "slo-1",
        lastState: "insufficient-data",
        lastNotifiedState: null,
        lastNotifiedAt: null,
        lastTransitionAt: new Date(1_000_000),
        lastBurnRate: null,
        updatedAt: new Date(1_000_000),
      },
      nextState: "healthy",
      burnRate: 0,
      nowMs: 2_000_000,
    });
    expect(withoutAlert.shouldNotify).toBe(false);
  });

  it("skips recovery when notifyOnRecovery=false", () => {
    const decision = decideSloAlert({
      sloId: "slo-1",
      policy: { ...policy, notifyOnRecovery: false },
      previous: {
        sloId: "slo-1",
        lastState: "warning",
        lastNotifiedState: "warning",
        lastNotifiedAt: new Date(1_000_000),
        lastTransitionAt: new Date(1_000_000),
        lastBurnRate: 2,
        updatedAt: new Date(1_000_000),
      },
      nextState: "healthy",
      burnRate: 0,
      nowMs: 2_000_000,
    });
    expect(decision.shouldNotify).toBe(false);
  });

  it("never notifies on insufficient-data", () => {
    const decision = decideSloAlert({
      sloId: "slo-1",
      policy,
      previous: null,
      nextState: "insufficient-data",
      burnRate: null,
      nowMs: 1_000_000,
    });
    expect(decision.shouldNotify).toBe(false);
    expect(decision.action).toBe("record-only");
  });
});

describe("formatSloAlertNotification", () => {
  it("emits safe payload without URLs", () => {
    const msg = formatSloAlertNotification({
      action: "notify-critical",
      serviceKey: "svc_abc",
      state: "critical",
      burnRate: 14.4,
      windowLabel: "fast",
    });
    expect(msg.title).toMatch(/critical/i);
    expect(msg.body).not.toMatch(/https?:/i);
    expect(msg.body).toContain("svc_abc");
  });
});
