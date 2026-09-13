import { describe, expect, it } from "vitest";
import {
  parsePrometheusInstantQuery,
  parsePrometheusRangeQuery,
  prometheusConfigSchema,
  prometheusQueryStringSchema,
  prometheusRangeQueryInputSchema,
  prometheusSecretSchema,
} from "./schemas";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";

describe("prometheus schemas", () => {
  it("accepts a valid origin config and optional bearer token", () => {
    expect(
      prometheusConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }),
    ).toMatchObject({ verifyTls: true, timeoutMs: 8000 });
    expect(prometheusSecretSchema.parse({})).toEqual({});
    expect(prometheusSecretSchema.parse({ bearerToken: "prom-token" })).toEqual({
      bearerToken: "prom-token",
    });
    expect(() => prometheusSecretSchema.parse({ bearerToken: "bad\nkey" })).toThrow(
      /visible ASCII/,
    );
  });

  it("rejects a query that is too long or contains control characters", () => {
    expect(prometheusQueryStringSchema.parse("up")).toBe("up");
    expect(() => prometheusQueryStringSchema.parse("up\nrate")).toThrow(/control|newlines/);
    expect(() => prometheusQueryStringSchema.parse("up\u0000")).toThrow(/control/);
    expect(() => prometheusQueryStringSchema.parse("a".repeat(513))).toThrow();
    expect(() =>
      parsePrometheusInstantQuery({ integrationId: INTEGRATION_ID, query: "up\n" }),
    ).toThrow(/invalid/i);
  });

  it("rejects a range that is too long or a step that is too small", () => {
    expect(() =>
      prometheusRangeQueryInputSchema.parse({
        integrationId: INTEGRATION_ID,
        query: "up",
        rangeSeconds: 21_601,
        stepSeconds: 60,
      }),
    ).toThrow();
    expect(() =>
      prometheusRangeQueryInputSchema.parse({
        integrationId: INTEGRATION_ID,
        query: "up",
        rangeSeconds: 900,
        stepSeconds: 14,
      }),
    ).toThrow();
    expect(() =>
      parsePrometheusRangeQuery({
        integrationId: INTEGRATION_ID,
        query: "up",
        rangeSeconds: 21_600,
        stepSeconds: 15,
      }),
    ).toThrow(/invalid/i);
    expect(
      parsePrometheusRangeQuery({
        integrationId: INTEGRATION_ID,
        query: "up",
        rangeSeconds: 900,
        stepSeconds: 60,
      }),
    ).toEqual({
      mode: "range",
      query: "up",
      rangeSeconds: 900,
      stepSeconds: 60,
    });
  });
});
