import { describe, expect, it } from "vitest";
import {
  SONARR_DISKSPACE_PATH,
  SONARR_HEALTH_PATH,
  SONARR_QUEUE_STATUS_PATH,
  SONARR_SERIES_PATH,
  SONARR_SYSTEM_STATUS_PATH,
  assertSonarrBaseUrl,
  assertSonarrEndpointAllowed,
} from "./policy";

describe("sonarr policy", () => {
  it("requires an origin-only HTTP(S) URL", () => {
    expect(assertSonarrBaseUrl("https://sonarr.lab:8989").origin).toBe("https://sonarr.lab:8989");
    expect(() => assertSonarrBaseUrl("https://user:pass@sonarr.lab:8989")).toThrow(/credentials/i);
    expect(() => assertSonarrBaseUrl("https://sonarr.lab:8989/api")).toThrow(/origin/i);
    expect(() => assertSonarrBaseUrl("https://sonarr.lab:8989/?next=/api/v3/command")).toThrow(
      /query or fragment/i,
    );
  });

  it("allows documented GET probes and POST command", () => {
    assertSonarrEndpointAllowed("GET", `https://sonarr.lab:8989${SONARR_SYSTEM_STATUS_PATH}`);
    assertSonarrEndpointAllowed("GET", `https://sonarr.lab:8989${SONARR_HEALTH_PATH}`);
    assertSonarrEndpointAllowed("GET", `https://sonarr.lab:8989${SONARR_QUEUE_STATUS_PATH}`);
    assertSonarrEndpointAllowed("GET", `https://sonarr.lab:8989${SONARR_SERIES_PATH}`);
    assertSonarrEndpointAllowed("GET", `https://sonarr.lab:8989${SONARR_DISKSPACE_PATH}`);
    assertSonarrEndpointAllowed("POST", "https://sonarr.lab:8989/api/v3/command");
    expect(() =>
      assertSonarrEndpointAllowed(
        "GET",
        `https://sonarr.lab:8989${SONARR_SYSTEM_STATUS_PATH}?apikey=x`,
      ),
    ).toThrow(/not allowed/i);
    expect(() =>
      assertSonarrEndpointAllowed(
        "GET",
        `https://sonarr.lab:8989${SONARR_QUEUE_STATUS_PATH}?includeUnknownSeriesItems=true`,
      ),
    ).toThrow(/query parameters/i);
    expect(() =>
      assertSonarrEndpointAllowed("POST", `https://sonarr.lab:8989${SONARR_SYSTEM_STATUS_PATH}`),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertSonarrEndpointAllowed("GET", "https://sonarr.lab:8989/api/v3/command"),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertSonarrEndpointAllowed("PUT", "https://sonarr.lab:8989/api/v3/command"),
    ).toThrow(/method/i);
    expect(() =>
      assertSonarrEndpointAllowed(
        "GET",
        `https://sonarr.lab:8989${SONARR_SERIES_PATH}/%2e%2e/command`,
      ),
    ).toThrow(/traversal/i);
    expect(() =>
      assertSonarrEndpointAllowed("GET", "https://sonarr.lab:8989/api/v3//series"),
    ).toThrow(/traversal/i);
  });
});
