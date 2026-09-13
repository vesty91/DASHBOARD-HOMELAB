import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import { assembleQueryDto, parsePrometheusApiBody } from "./dto";

const TOKEN = "PROM-BEARER-SUPER-SECRET";

function success(resultType: "vector" | "matrix", result: unknown): string {
  return JSON.stringify({ status: "success", data: { resultType, result } });
}

describe("prometheus dto", () => {
  it("keeps only allowlisted labels and redacts secrets", () => {
    const parsed = parsePrometheusApiBody(
      success("vector", [
        {
          metric: {
            __name__: "up",
            job: "prometheus",
            instance: "localhost:9090",
            leaked: TOKEN,
            env: "prod",
          },
          value: [1_700_000_000, "1"],
        },
      ]),
      "vector",
      [TOKEN],
    );
    expect(parsed.series[0]?.labels).toEqual({
      __name__: "up",
      job: "prometheus",
      instance: "localhost:9090",
    });
    expect(JSON.stringify(parsed)).not.toContain(TOKEN);
    expect(JSON.stringify(parsed)).not.toContain("env");
    expect(JSON.stringify(parsed)).not.toContain("leaked");
  });

  it("keeps non-finite official samples as null with a valid timestamp", () => {
    const parsed = parsePrometheusApiBody(
      success("vector", [
        { metric: { __name__: "x" }, value: [1_700_000_000.5, "NaN"] },
        { metric: { __name__: "y" }, value: [1_700_000_001, "+Inf"] },
        { metric: { __name__: "z" }, value: [1_700_000_002, "-Inf"] },
      ]),
      "vector",
    );
    expect(parsed.series.map((series) => series.points[0])).toEqual([
      { tMs: 1_700_000_000_500, value: null },
      { tMs: 1_700_000_001_000, value: null },
      { tMs: 1_700_000_002_000, value: null },
    ]);
  });

  it("parses a matrix and marks truncation after 20 series", () => {
    const result = Array.from({ length: 21 }, (_, index) => ({
      metric: { __name__: "up", instance: `n${index}` },
      values: [[1_700_000_000, "1"]],
    }));
    const parsed = parsePrometheusApiBody(success("matrix", result), "matrix");
    expect(parsed.truncated).toBe(true);
    expect(parsed.series).toHaveLength(20);
    expect(assembleQueryDto(parsed).status).toBe("degraded");
  });

  it("rejects oversized raw series and sample counts", () => {
    const tooManySeries = Array.from({ length: 51 }, (_, index) => ({
      metric: { __name__: "up", instance: `n${index}` },
      value: [1_700_000_000, "1"],
    }));
    expect(() => parsePrometheusApiBody(success("vector", tooManySeries), "vector")).toThrow(
      /too many series/,
    );
    const tooManySamples = [
      {
        metric: { __name__: "up" },
        values: Array.from({ length: 2001 }, (_, index) => [1_700_000_000 + index, "1"]),
      },
    ];
    expect(() => parsePrometheusApiBody(success("matrix", tooManySamples), "matrix")).toThrow(
      /too many samples/,
    );
  });

  it("rejects invalid JSON, error responses and malformed payloads", () => {
    expect(() => parsePrometheusApiBody("{", "vector")).toThrow(IntegrationError);
    expect(() =>
      parsePrometheusApiBody(
        JSON.stringify({ status: "error", errorType: "bad_data", error: "boom" }),
        "vector",
      ),
    ).toThrow(/error/);
    expect(() =>
      parsePrometheusApiBody(
        JSON.stringify({
          status: "success",
          data: { resultType: "scalar", result: [1_700_000_000, "1"] },
        }),
        "vector",
      ),
    ).toThrow(/resultType/);
    expect(() =>
      parsePrometheusApiBody(
        success("vector", [{ metric: { __name__: "up" }, value: "1" }]),
        "vector",
      ),
    ).toThrow(/malformed/);
    expect(() =>
      parsePrometheusApiBody(
        success("matrix", [{ metric: { __name__: "up" }, values: "nope" }]),
        "matrix",
      ),
    ).toThrow(/malformed/);
  });
});
