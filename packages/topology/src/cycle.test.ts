import { describe, expect, it } from "vitest";
import { wouldCreateCycle } from "./cycle";

describe("wouldCreateCycle", () => {
  it("rejects self loops", () => {
    expect(wouldCreateCycle([], "a", "a")).toBe(true);
  });

  it("allows a simple edge", () => {
    expect(wouldCreateCycle([], "a", "b")).toBe(false);
  });

  it("rejects reverse edge that closes a cycle", () => {
    expect(
      wouldCreateCycle([{ upstreamServiceKey: "a", downstreamServiceKey: "b" }], "b", "a"),
    ).toBe(true);
  });

  it("rejects multi-hop cycles", () => {
    const edges = [
      { upstreamServiceKey: "a", downstreamServiceKey: "b" },
      { upstreamServiceKey: "b", downstreamServiceKey: "c" },
    ];
    expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
    expect(wouldCreateCycle(edges, "a", "c")).toBe(false);
  });

  it("allows fan-out and fan-in without cycles", () => {
    const edges = [
      { upstreamServiceKey: "db", downstreamServiceKey: "api" },
      { upstreamServiceKey: "db", downstreamServiceKey: "worker" },
      { upstreamServiceKey: "redis", downstreamServiceKey: "api" },
    ];
    expect(wouldCreateCycle(edges, "redis", "worker")).toBe(false);
  });
});
