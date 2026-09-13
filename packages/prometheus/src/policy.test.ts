import { describe, expect, it } from "vitest";
import {
  PROMETHEUS_QUERY_PATH,
  PROMETHEUS_QUERY_RANGE_PATH,
  assertPrometheusBaseUrl,
  assertPrometheusEndpointAllowed,
} from "./policy";

describe("prometheus policy", () => {
  it("requires an origin-only HTTP(S) URL", () => {
    expect(assertPrometheusBaseUrl("http://prometheus.example:9090").origin).toBe(
      "http://prometheus.example:9090",
    );
    expect(() => assertPrometheusBaseUrl("https://user:pass@prometheus.example")).toThrow(
      /credentials/i,
    );
    expect(() => assertPrometheusBaseUrl("https://prometheus.example/api/v1/query")).toThrow(
      /origin/i,
    );
    expect(() => assertPrometheusBaseUrl("https://prometheus.example/?q=1")).toThrow(/query/i);
  });

  it("allows only POST query and query_range without URL parameters", () => {
    assertPrometheusEndpointAllowed("POST", `https://prometheus.lab${PROMETHEUS_QUERY_PATH}`);
    assertPrometheusEndpointAllowed("POST", `https://prometheus.lab${PROMETHEUS_QUERY_RANGE_PATH}`);
    expect(() =>
      assertPrometheusEndpointAllowed("GET", `https://prometheus.lab${PROMETHEUS_QUERY_PATH}`),
    ).toThrow(/method/i);
    expect(() =>
      assertPrometheusEndpointAllowed(
        "POST",
        `https://prometheus.lab${PROMETHEUS_QUERY_PATH}?query=up`,
      ),
    ).toThrow(/query/i);
    expect(() =>
      assertPrometheusEndpointAllowed("POST", "https://prometheus.lab/api/v1/label/job/values"),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertPrometheusEndpointAllowed("POST", "https://prometheus.lab/api/v1/series"),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertPrometheusEndpointAllowed("POST", "https://prometheus.lab/api/v1/targets"),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertPrometheusEndpointAllowed("POST", "https://prometheus.lab/api/v1/status/config"),
    ).toThrow(/allowlist/i);
  });
});
