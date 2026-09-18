import { describe, expect, it } from "vitest";
import { analyzeImpact } from "./impact";
import {
  createImpactEventReconciler,
  diffImpactTransitions,
  type DependencyImpactChangedEvent,
} from "./impact-events";
import type { TopologyStorePort } from "./ports";
import type { ServiceDependency } from "./types";

const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const c = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function analysis(actual: Record<string, "available" | "unavailable" | "unknown">) {
  return analyzeImpact({
    edges: [
      { upstreamServiceKey: a, downstreamServiceKey: b },
      { upstreamServiceKey: b, downstreamServiceKey: c },
    ],
    actualByService: new Map(Object.entries(actual)),
  });
}

describe("diffImpactTransitions", () => {
  it("seeds without emitting when previous is empty", () => {
    const next = analysis({ [a]: "unavailable", [b]: "available", [c]: "available" });
    const { events, nextSnapshot } = diffImpactTransitions({
      previous: new Map(),
      next,
      occurredAt: "2026-09-18T00:00:00.000Z",
    });
    expect(events).toEqual([]);
    expect(nextSnapshot.get(b)).toBe("impacted");
    expect(nextSnapshot.get(c)).toBe("impacted");
  });

  it("emits none -> impacted", () => {
    const previous = new Map([
      [a, "none" as const],
      [b, "none" as const],
      [c, "none" as const],
    ]);
    const next = analysis({ [a]: "unavailable", [b]: "available", [c]: "available" });
    const { events } = diffImpactTransitions({
      previous,
      next,
      occurredAt: "2026-09-18T00:00:00.000Z",
      seedIfEmpty: false,
    });
    expect(events.map((e) => [e.serviceKey, e.impactStatus])).toEqual([
      [b, "impacted"],
      [c, "impacted"],
    ]);
  });

  it("emits none -> at-risk for unknown upstream", () => {
    const previous = new Map([
      [a, "none" as const],
      [b, "none" as const],
    ]);
    const next = analyzeImpact({
      edges: [{ upstreamServiceKey: a, downstreamServiceKey: b }],
      actualByService: new Map([
        [a, "unknown"],
        [b, "available"],
      ]),
    });
    const { events } = diffImpactTransitions({
      previous,
      next,
      occurredAt: "2026-09-18T00:00:00.000Z",
      seedIfEmpty: false,
    });
    expect(events).toEqual([
      expect.objectContaining({
        serviceKey: b,
        impactStatus: "at-risk",
        type: "dependency.impact.changed",
      }),
    ]);
  });

  it("emits at-risk -> impacted and impacted -> none", () => {
    const atRisk = analyzeImpact({
      edges: [{ upstreamServiceKey: a, downstreamServiceKey: b }],
      actualByService: new Map([
        [a, "unknown"],
        [b, "available"],
      ]),
    });
    const previous = new Map(atRisk.services.map((s) => [s.serviceKey, s.impactStatus]));
    const impacted = analyzeImpact({
      edges: [{ upstreamServiceKey: a, downstreamServiceKey: b }],
      actualByService: new Map([
        [a, "unavailable"],
        [b, "available"],
      ]),
    });
    const up = diffImpactTransitions({
      previous,
      next: impacted,
      occurredAt: "2026-09-18T00:01:00.000Z",
    });
    expect(up.events).toEqual([
      expect.objectContaining({ serviceKey: b, impactStatus: "impacted" }),
    ]);

    const recovered = analyzeImpact({
      edges: [{ upstreamServiceKey: a, downstreamServiceKey: b }],
      actualByService: new Map([
        [a, "available"],
        [b, "available"],
      ]),
    });
    const down = diffImpactTransitions({
      previous: up.nextSnapshot,
      next: recovered,
      occurredAt: "2026-09-18T00:02:00.000Z",
    });
    expect(down.events).toEqual([expect.objectContaining({ serviceKey: b, impactStatus: "none" })]);
  });

  it("emits nothing when impact state is unchanged", () => {
    const next = analysis({ [a]: "unavailable", [b]: "available", [c]: "available" });
    const previous = new Map(next.services.map((s) => [s.serviceKey, s.impactStatus]));
    const { events } = diffImpactTransitions({
      previous,
      next,
      occurredAt: "2026-09-18T00:00:00.000Z",
    });
    expect(events).toEqual([]);
  });

  it("payload stays closed and safe", () => {
    const previous = new Map([[b, "none" as const]]);
    const next = analysis({ [a]: "unavailable", [b]: "available", [c]: "available" });
    const { events } = diffImpactTransitions({
      previous,
      next,
      occurredAt: "2026-09-18T00:00:00.000Z",
      seedIfEmpty: false,
    });
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual([
        "candidateRootCause",
        "impactStatus",
        "occurredAt",
        "serviceKey",
        "type",
      ]);
      expect(JSON.stringify(event)).not.toMatch(/hostname|password|secret|stack|http/i);
    }
  });
});

describe("createImpactEventReconciler", () => {
  function memoryStore(input: {
    edges: ServiceDependency[];
    unavailable: string[];
    integrations: string[];
  }): TopologyStorePort {
    return {
      integrationExists: async (id) => input.integrations.includes(id),
      listIntegrationIds: async () => input.integrations,
      listOpenUnavailableServiceKeys: async () => input.unavailable,
      listDependencies: async () => input.edges,
      getDependency: async () => null,
      createDependency: async () => {
        throw new Error("unused");
      },
      deleteDependency: async () => undefined,
    };
  }

  it("publishes on transition and skips duplicates / dry-run", async () => {
    const published: DependencyImpactChangedEvent[] = [];
    const edges: ServiceDependency[] = [
      {
        id: "e1",
        upstreamServiceKey: a,
        downstreamServiceKey: b,
        relationship: "depends_on",
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const store = memoryStore({
      edges,
      unavailable: [],
      integrations: [a, b],
    });
    const reconciler = createImpactEventReconciler({
      store,
      publishEvent: async (event) => {
        published.push(event);
      },
    });

    // Cold start seed
    await reconciler.reconcile({ occurredAt: "2026-09-18T00:00:00.000Z" });
    expect(published).toEqual([]);

    store.listOpenUnavailableServiceKeys = async () => [a];
    const first = await reconciler.reconcile({ occurredAt: "2026-09-18T00:01:00.000Z" });
    expect(first.emitted).toBe(1);
    expect(published[0]?.impactStatus).toBe("impacted");

    // Duplicate source recalculation
    const second = await reconciler.reconcile({ occurredAt: "2026-09-18T00:01:30.000Z" });
    expect(second.emitted).toBe(0);
    expect(published).toHaveLength(1);

    // Recovery
    store.listOpenUnavailableServiceKeys = async () => [];
    const third = await reconciler.reconcile({ occurredAt: "2026-09-18T00:02:00.000Z" });
    expect(third.emitted).toBe(1);
    expect(published[1]?.impactStatus).toBe("none");

    const dry = createImpactEventReconciler({
      store,
      dryRun: true,
      publishEvent: async (event) => {
        published.push(event);
      },
    });
    store.listOpenUnavailableServiceKeys = async () => [a];
    await dry.reconcile({ occurredAt: "2026-09-18T00:03:00.000Z", seedIfEmpty: false });
    expect(published).toHaveLength(2);
  });

  it("tolerates multiple upstream outages without storming unchanged services", async () => {
    const published: DependencyImpactChangedEvent[] = [];
    const edges: ServiceDependency[] = [
      {
        id: "e1",
        upstreamServiceKey: a,
        downstreamServiceKey: b,
        relationship: "depends_on",
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "e2",
        upstreamServiceKey: c,
        downstreamServiceKey: b,
        relationship: "depends_on",
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const store = memoryStore({
      edges,
      unavailable: [a],
      integrations: [a, b, c],
    });
    const reconciler = createImpactEventReconciler({
      store,
      publishEvent: async (event) => {
        published.push(event);
      },
    });
    await reconciler.reconcile({ seedIfEmpty: false, occurredAt: "2026-09-18T00:00:00.000Z" });
    const afterFirst = published.length;
    store.listOpenUnavailableServiceKeys = async () => [a, c];
    await reconciler.reconcile({ occurredAt: "2026-09-18T00:01:00.000Z" });
    // b already impacted — no additional event for unchanged impactStatus
    expect(published.length).toBe(afterFirst);
  });
});
