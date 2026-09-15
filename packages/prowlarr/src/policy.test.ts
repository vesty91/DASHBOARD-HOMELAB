import { describe, expect, it } from "vitest";
import {
  PROWLARR_HEALTH_PATH,
  PROWLARR_INDEXER_PATH,
  PROWLARR_INDEXERSTATUS_PATH,
  PROWLARR_SYSTEM_STATUS_PATH,
  assertProwlarrBaseUrl,
  assertProwlarrEndpointAllowed,
} from "./policy";

describe("prowlarr policy", () => {
  it("requires an origin-only HTTP(S) URL", () => {
    expect(assertProwlarrBaseUrl("https://prowlarr.lab:9696").origin).toBe(
      "https://prowlarr.lab:9696",
    );
    expect(() => assertProwlarrBaseUrl("https://user:pass@prowlarr.lab:9696")).toThrow(
      /credentials/i,
    );
    expect(() => assertProwlarrBaseUrl("https://prowlarr.lab:9696/api")).toThrow(/origin/i);
    expect(() => assertProwlarrBaseUrl("https://prowlarr.lab:9696/?next=/api/v1/search")).toThrow(
      /query or fragment/i,
    );
  });

  it("allows only the read-only Prowlarr endpoints", () => {
    assertProwlarrEndpointAllowed("GET", `https://prowlarr.lab:9696${PROWLARR_SYSTEM_STATUS_PATH}`);
    assertProwlarrEndpointAllowed("GET", `https://prowlarr.lab:9696${PROWLARR_HEALTH_PATH}`);
    assertProwlarrEndpointAllowed("GET", `https://prowlarr.lab:9696${PROWLARR_INDEXER_PATH}`);
    assertProwlarrEndpointAllowed("GET", `https://prowlarr.lab:9696${PROWLARR_INDEXERSTATUS_PATH}`);
    expect(() =>
      assertProwlarrEndpointAllowed(
        "GET",
        `https://prowlarr.lab:9696${PROWLARR_SYSTEM_STATUS_PATH}?apikey=x`,
      ),
    ).toThrow(/not allowed/i);
    expect(() =>
      assertProwlarrEndpointAllowed(
        "GET",
        `https://prowlarr.lab:9696${PROWLARR_INDEXER_PATH}?apikey=secret`,
      ),
    ).toThrow(/not allowed/i);
    expect(() =>
      assertProwlarrEndpointAllowed(
        "POST",
        `https://prowlarr.lab:9696${PROWLARR_SYSTEM_STATUS_PATH}`,
      ),
    ).toThrow(/method/i);
    expect(() =>
      assertProwlarrEndpointAllowed("GET", "https://prowlarr.lab:9696/api/v1/search"),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertProwlarrEndpointAllowed("GET", "https://prowlarr.lab:9696/api/v1/command"),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertProwlarrEndpointAllowed("GET", "https://prowlarr.lab:9696/api/v3/system/status"),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertProwlarrEndpointAllowed(
        "GET",
        `https://prowlarr.lab:9696${PROWLARR_INDEXER_PATH}/%2e%2e/command`,
      ),
    ).toThrow(/traversal/i);
    expect(() =>
      assertProwlarrEndpointAllowed("GET", "https://prowlarr.lab:9696/api/v1//indexer"),
    ).toThrow(/traversal/i);
  });
});
