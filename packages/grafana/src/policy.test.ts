import { describe, expect, it } from "vitest";
import {
  GRAFANA_ALERTS_PATH,
  GRAFANA_DATASOURCES_PATH,
  GRAFANA_FOLDERS_PATH,
  GRAFANA_HEALTH_PATH,
  GRAFANA_SEARCH_PATH,
  assertGrafanaBaseUrl,
  assertGrafanaEndpointAllowed,
} from "./policy";

describe("grafana policy", () => {
  it("requires an origin-only HTTP(S) URL", () => {
    expect(assertGrafanaBaseUrl("https://grafana.lab:3000").origin).toBe(
      "https://grafana.lab:3000",
    );
    expect(() => assertGrafanaBaseUrl("https://user:pass@grafana.lab:3000")).toThrow(
      /credentials/i,
    );
    expect(() => assertGrafanaBaseUrl("https://grafana.lab:3000/api")).toThrow(/origin/i);
    expect(() => assertGrafanaBaseUrl("https://grafana.lab:3000/?next=/d/abc")).toThrow(
      /query or fragment/i,
    );
  });

  it("allows only the read-only Grafana endpoints", () => {
    assertGrafanaEndpointAllowed("GET", `https://grafana.lab:3000${GRAFANA_HEALTH_PATH}`);
    assertGrafanaEndpointAllowed(
      "GET",
      `https://grafana.lab:3000${GRAFANA_SEARCH_PATH}?type=dash-db&limit=100`,
    );
    assertGrafanaEndpointAllowed(
      "GET",
      `https://grafana.lab:3000${GRAFANA_FOLDERS_PATH}?limit=100`,
    );
    assertGrafanaEndpointAllowed("GET", `https://grafana.lab:3000${GRAFANA_ALERTS_PATH}`);
    assertGrafanaEndpointAllowed("GET", `https://grafana.lab:3000${GRAFANA_DATASOURCES_PATH}`);
    expect(() =>
      assertGrafanaEndpointAllowed("GET", `https://grafana.lab:3000${GRAFANA_HEALTH_PATH}?token=x`),
    ).toThrow(/not allowed/i);
    expect(() =>
      assertGrafanaEndpointAllowed(
        "GET",
        `https://grafana.lab:3000${GRAFANA_SEARCH_PATH}?type=dash-folder&limit=100`,
      ),
    ).toThrow(/dash-db/i);
    expect(() =>
      assertGrafanaEndpointAllowed(
        "GET",
        `https://grafana.lab:3000${GRAFANA_SEARCH_PATH}?type=dash-db&limit=101`,
      ),
    ).toThrow(/limit/i);
    expect(() =>
      assertGrafanaEndpointAllowed(
        "GET",
        `https://grafana.lab:3000${GRAFANA_SEARCH_PATH}?type=dash-db&limit=100&query=secret`,
      ),
    ).toThrow(/query parameter/i);
    expect(() =>
      assertGrafanaEndpointAllowed(
        "GET",
        `https://grafana.lab:3000${GRAFANA_FOLDERS_PATH}?limit=100&page=1`,
      ),
    ).toThrow(/query parameter/i);
    expect(() =>
      assertGrafanaEndpointAllowed("POST", `https://grafana.lab:3000${GRAFANA_HEALTH_PATH}`),
    ).toThrow(/method/i);
    expect(() =>
      assertGrafanaEndpointAllowed("GET", "https://grafana.lab:3000/api/ds/query"),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertGrafanaEndpointAllowed("GET", "https://grafana.lab:3000/api/datasources/proxy/1"),
    ).toThrow(/allowlist/i);
  });
});
