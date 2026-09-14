import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  GRAFANA_ALERTS_MAX,
  GRAFANA_DATASOURCES_MAX,
  GRAFANA_SEARCH_LIMIT,
  mapAlerts,
  mapDatasources,
  mapFolders,
  mapHealth,
  mapSearch,
  parseJsonValue,
} from "./dto";

const TOKEN = "glsa_secretServiceAccountToken012345";

describe("grafana dto", () => {
  it("maps health and redacts secrets from the version", () => {
    expect(mapHealth({ commit: "abc", database: "ok", version: "11.2.0" }, [TOKEN])).toEqual({
      version: "11.2.0",
      database: "ok",
    });
    expect(mapHealth({ database: "failing", version: TOKEN }, [TOKEN])).toEqual({
      version: "[REDACTED]",
      database: "failing",
    });
  });

  it("rejects malformed health payloads", () => {
    expect(() => mapHealth([])).toThrow(IntegrationError);
    expect(() => mapHealth({ version: "11.2.0" })).toThrow(/database/i);
    expect(() => mapHealth({ database: "unknown", version: "11.2.0" })).toThrow(/database/i);
  });

  it("counts search and folders without titles or URLs", () => {
    const mapped = mapSearch([
      {
        title: "Secret dashboard",
        url: "/d/abc/secret-dashboard",
        type: "dash-db",
        uid: "abc",
      },
      { title: "Other", url: "/d/def/other", type: "dash-db" },
    ]);
    expect(mapped).toEqual({ count: 2, truncated: false });
    expect(JSON.stringify(mapped)).not.toContain("Secret dashboard");
    expect(JSON.stringify(mapped)).not.toContain("/d/");
    expect(mapFolders([{ title: "Private folder", uid: "fold" }])).toEqual({
      count: 1,
      truncated: false,
    });
    expect(JSON.stringify(mapFolders([{ title: "Private folder" }]))).not.toContain("Private");
  });

  it("rejects oversized and malformed search payloads", () => {
    expect(() =>
      mapSearch(Array.from({ length: GRAFANA_SEARCH_LIMIT + 1 }, () => ({ type: "dash-db" }))),
    ).toThrow(/oversized/i);
    expect(() => mapSearch({ dashboards: [] })).toThrow(IntegrationError);
    expect(() => mapSearch(["bad"])).toThrow(IntegrationError);
  });

  it("counts alert states without payloads", () => {
    const mapped = mapAlerts({
      status: "success",
      data: {
        alerts: [
          {
            labels: { alertname: "InstanceDown", instance: "10.0.0.8" },
            annotations: { description: "host down" },
            state: "firing",
            value: "1e+00",
          },
          { state: "pending", labels: { alertname: "DiskFull" } },
          { state: "inactive" },
          { state: "Alerting" },
          { state: "weird" },
        ],
      },
    });
    expect(mapped).toEqual({ firing: 2, pending: 1, inactive: 1, other: 1 });
    expect(JSON.stringify(mapped)).not.toContain("InstanceDown");
    expect(JSON.stringify(mapped)).not.toContain("10.0.0.8");
    expect(JSON.stringify(mapped)).not.toContain("host down");
  });

  it("rejects malformed and oversized alerts", () => {
    expect(() => mapAlerts({ status: "success" })).toThrow(IntegrationError);
    expect(() => mapAlerts({ data: { alerts: ["bad"] } })).toThrow(IntegrationError);
    expect(() =>
      mapAlerts({
        data: {
          alerts: Array.from({ length: GRAFANA_ALERTS_MAX + 1 }, () => ({ state: "firing" })),
        },
      }),
    ).toThrow(/oversized/i);
  });

  it("tallies datasource types without secrets, names or URLs", () => {
    const mapped = mapDatasources(
      [
        {
          name: "Prometheus",
          type: "prometheus",
          url: "http://prometheus.internal:9090",
          user: "admin",
          database: "metrics",
          password: TOKEN,
          basicAuthPassword: "basic-secret",
          secureJsonData: { token: TOKEN },
          secureJsonFields: { password: true },
          jsonData: { httpHeaderName1: "Authorization" },
        },
        { name: "Postgres", type: "grafana-postgresql-datasource", url: "postgres://db" },
        { type: "prometheus" },
      ],
      [TOKEN],
    );
    expect(mapped.count).toBe(3);
    expect(mapped.types).toEqual([
      { type: "grafana-postgresql-datasource", count: 1 },
      { type: "prometheus", count: 2 },
    ]);
    const serialized = JSON.stringify(mapped);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain("Prometheus");
    expect(serialized).not.toContain("postgres://");
    expect(serialized).not.toContain("admin");
    expect(serialized).not.toContain("metrics");
    expect(serialized).not.toContain("basic-secret");
    expect(serialized).not.toContain("httpHeaderName1");
  });

  it("rejects oversized datasources and invalid JSON", () => {
    expect(() =>
      mapDatasources(Array.from({ length: GRAFANA_DATASOURCES_MAX + 1 }, () => ({ type: "x" }))),
    ).toThrow(/oversized/i);
    expect(() => parseJsonValue("{")).toThrow(/invalid JSON/);
  });
});
