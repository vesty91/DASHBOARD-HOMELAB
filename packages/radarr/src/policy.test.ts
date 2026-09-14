import { describe, expect, it } from "vitest";
import {
  RADARR_DISKSPACE_PATH,
  RADARR_HEALTH_PATH,
  RADARR_QUEUE_STATUS_PATH,
  RADARR_MOVIE_PATH,
  RADARR_SYSTEM_STATUS_PATH,
  assertRadarrBaseUrl,
  assertRadarrEndpointAllowed,
} from "./policy";

describe("radarr policy", () => {
  it("requires an origin-only HTTP(S) URL", () => {
    expect(assertRadarrBaseUrl("https://radarr.lab:7878").origin).toBe("https://radarr.lab:7878");
    expect(() => assertRadarrBaseUrl("https://user:pass@radarr.lab:7878")).toThrow(/credentials/i);
    expect(() => assertRadarrBaseUrl("https://radarr.lab:7878/api")).toThrow(/origin/i);
    expect(() => assertRadarrBaseUrl("https://radarr.lab:7878/?next=/api/v3/command")).toThrow(
      /query or fragment/i,
    );
  });

  it("allows only the read-only Radarr endpoints", () => {
    assertRadarrEndpointAllowed("GET", `https://radarr.lab:7878${RADARR_SYSTEM_STATUS_PATH}`);
    assertRadarrEndpointAllowed("GET", `https://radarr.lab:7878${RADARR_HEALTH_PATH}`);
    assertRadarrEndpointAllowed("GET", `https://radarr.lab:7878${RADARR_QUEUE_STATUS_PATH}`);
    assertRadarrEndpointAllowed("GET", `https://radarr.lab:7878${RADARR_MOVIE_PATH}`);
    assertRadarrEndpointAllowed("GET", `https://radarr.lab:7878${RADARR_DISKSPACE_PATH}`);
    expect(() =>
      assertRadarrEndpointAllowed(
        "GET",
        `https://radarr.lab:7878${RADARR_SYSTEM_STATUS_PATH}?apikey=x`,
      ),
    ).toThrow(/not allowed/i);
    expect(() =>
      assertRadarrEndpointAllowed(
        "GET",
        `https://radarr.lab:7878${RADARR_QUEUE_STATUS_PATH}?includeUnknownSeriesItems=true`,
      ),
    ).toThrow(/query parameters/i);
    expect(() =>
      assertRadarrEndpointAllowed("POST", `https://radarr.lab:7878${RADARR_SYSTEM_STATUS_PATH}`),
    ).toThrow(/method/i);
    expect(() =>
      assertRadarrEndpointAllowed("GET", "https://radarr.lab:7878/api/v3/command"),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertRadarrEndpointAllowed(
        "GET",
        `https://radarr.lab:7878${RADARR_MOVIE_PATH}/%2e%2e/command`,
      ),
    ).toThrow(/traversal/i);
    expect(() =>
      assertRadarrEndpointAllowed("GET", "https://radarr.lab:7878/api/v3//movie"),
    ).toThrow(/traversal/i);
  });
});
