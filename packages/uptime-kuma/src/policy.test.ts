import { describe, expect, it } from "vitest";
import {
  UPTIME_KUMA_METRICS_PATH,
  assertUptimeKumaBaseUrl,
  assertUptimeKumaEndpointAllowed,
} from "./policy";

describe("uptime-kuma policy", () => {
  it("requires an origin-only HTTP(S) URL", () => {
    expect(assertUptimeKumaBaseUrl("https://uptime.lab:3001").origin).toBe(
      "https://uptime.lab:3001",
    );
    expect(() => assertUptimeKumaBaseUrl("https://user:pass@uptime.lab")).toThrow(/credentials/i);
    expect(() => assertUptimeKumaBaseUrl("https://uptime.lab/metrics")).toThrow(/origin/i);
  });

  it("allows only GET /metrics without query parameters", () => {
    assertUptimeKumaEndpointAllowed("GET", `https://uptime.lab${UPTIME_KUMA_METRICS_PATH}`);
    expect(() =>
      assertUptimeKumaEndpointAllowed(
        "GET",
        `https://uptime.lab${UPTIME_KUMA_METRICS_PATH}?token=x`,
      ),
    ).toThrow(/query/i);
    expect(() =>
      assertUptimeKumaEndpointAllowed("POST", `https://uptime.lab${UPTIME_KUMA_METRICS_PATH}`),
    ).toThrow(/method/i);
    expect(() =>
      assertUptimeKumaEndpointAllowed("GET", "https://uptime.lab/api/status-page/heartbeat"),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertUptimeKumaEndpointAllowed("GET", "https://uptime.lab/api/push/token"),
    ).toThrow(/allowlist/i);
  });
});
