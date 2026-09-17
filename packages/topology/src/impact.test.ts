import { describe, expect, it } from "vitest";
import { analyzeImpact } from "./impact";

const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const c = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const d = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("analyzeImpact", () => {
  it("keeps impact none when everything is available", () => {
    const result = analyzeImpact({
      edges: [{ upstreamServiceKey: a, downstreamServiceKey: b }],
      actualByService: new Map([
        [a, "available"],
        [b, "available"],
      ]),
    });
    expect(result.candidateRootCause).toBeNull();
    expect(result.services.every((s) => s.impactStatus === "none")).toBe(true);
  });

  it("marks transitive downstream as impacted without overwriting actual", () => {
    const result = analyzeImpact({
      edges: [
        { upstreamServiceKey: a, downstreamServiceKey: b },
        { upstreamServiceKey: b, downstreamServiceKey: c },
      ],
      actualByService: new Map([
        [a, "unavailable"],
        [b, "available"],
        [c, "available"],
      ]),
    });
    const byKey = Object.fromEntries(result.services.map((s) => [s.serviceKey, s]));
    expect(byKey[a]?.actualStatus).toBe("unavailable");
    expect(byKey[a]?.impactStatus).toBe("none");
    expect(byKey[b]?.actualStatus).toBe("available");
    expect(byKey[b]?.impactStatus).toBe("impacted");
    expect(byKey[c]?.impactStatus).toBe("impacted");
    expect(result.candidateRootCause).toBe(a);
  });

  it("marks direct dependents of unknown upstream as at-risk", () => {
    const result = analyzeImpact({
      edges: [{ upstreamServiceKey: a, downstreamServiceKey: b }],
      actualByService: new Map([
        [a, "unknown"],
        [b, "available"],
      ]),
    });
    const byKey = Object.fromEntries(result.services.map((s) => [s.serviceKey, s]));
    expect(byKey[b]?.impactStatus).toBe("at-risk");
  });

  it("fan-out picks shared unavailable upstream as candidate", () => {
    const result = analyzeImpact({
      edges: [
        { upstreamServiceKey: a, downstreamServiceKey: b },
        { upstreamServiceKey: a, downstreamServiceKey: c },
        { upstreamServiceKey: d, downstreamServiceKey: c },
      ],
      actualByService: new Map([
        [a, "unavailable"],
        [b, "available"],
        [c, "available"],
        [d, "available"],
      ]),
    });
    expect(result.candidateRootCause).toBe(a);
  });

  it("fan-in marks shared downstream impacted once", () => {
    const result = analyzeImpact({
      edges: [
        { upstreamServiceKey: a, downstreamServiceKey: c },
        { upstreamServiceKey: b, downstreamServiceKey: c },
      ],
      actualByService: new Map([
        [a, "unavailable"],
        [b, "available"],
        [c, "available"],
      ]),
    });
    const byKey = Object.fromEntries(result.services.map((s) => [s.serviceKey, s]));
    expect(byKey[c]?.impactStatus).toBe("impacted");
    expect(result.candidateRootCause).toBe(a);
  });

  it("multiple outages pick the higher blast-radius candidate", () => {
    const result = analyzeImpact({
      edges: [
        { upstreamServiceKey: a, downstreamServiceKey: b },
        { upstreamServiceKey: a, downstreamServiceKey: c },
        { upstreamServiceKey: d, downstreamServiceKey: b },
      ],
      actualByService: new Map([
        [a, "unavailable"],
        [b, "available"],
        [c, "available"],
        [d, "unavailable"],
      ]),
    });
    expect(result.candidateRootCause).toBe(a);
  });

  it("clears candidate when all recover", () => {
    const outage = analyzeImpact({
      edges: [{ upstreamServiceKey: a, downstreamServiceKey: b }],
      actualByService: new Map([
        [a, "unavailable"],
        [b, "available"],
      ]),
    });
    expect(outage.candidateRootCause).toBe(a);
    const recovered = analyzeImpact({
      edges: [{ upstreamServiceKey: a, downstreamServiceKey: b }],
      actualByService: new Map([
        [a, "available"],
        [b, "available"],
      ]),
    });
    expect(recovered.candidateRootCause).toBeNull();
    expect(recovered.services.every((s) => s.impactStatus === "none")).toBe(true);
  });

  it("respects depth bound", () => {
    const result = analyzeImpact({
      edges: [
        { upstreamServiceKey: a, downstreamServiceKey: b },
        { upstreamServiceKey: b, downstreamServiceKey: c },
        { upstreamServiceKey: c, downstreamServiceKey: d },
      ],
      actualByService: new Map([
        [a, "unavailable"],
        [b, "available"],
        [c, "available"],
        [d, "available"],
      ]),
      maxDepth: 1,
    });
    const byKey = Object.fromEntries(result.services.map((s) => [s.serviceKey, s]));
    expect(byKey[b]?.impactStatus).toBe("impacted");
    expect(byKey[c]?.impactStatus).toBe("none");
    expect(byKey[d]?.impactStatus).toBe("none");
    expect(result.truncated).toBe(true);
  });

  it("respects node bound", () => {
    const result = analyzeImpact({
      edges: [
        { upstreamServiceKey: a, downstreamServiceKey: b },
        { upstreamServiceKey: a, downstreamServiceKey: c },
        { upstreamServiceKey: a, downstreamServiceKey: d },
      ],
      actualByService: new Map([
        [a, "unavailable"],
        [b, "available"],
        [c, "available"],
        [d, "available"],
      ]),
      maxNodes: 2,
    });
    expect(result.truncated).toBe(true);
  });

  it("prefers impacted over at-risk when both apply", () => {
    const result = analyzeImpact({
      edges: [
        { upstreamServiceKey: a, downstreamServiceKey: b },
        { upstreamServiceKey: c, downstreamServiceKey: b },
      ],
      actualByService: new Map([
        [a, "unavailable"],
        [b, "available"],
        [c, "unknown"],
      ]),
    });
    const byKey = Object.fromEntries(result.services.map((s) => [s.serviceKey, s]));
    expect(byKey[b]?.impactStatus).toBe("impacted");
  });
});
