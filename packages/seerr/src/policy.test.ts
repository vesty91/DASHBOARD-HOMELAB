import { describe, expect, it } from "vitest";
import {
  SEERR_REQUEST_COUNT_PATH,
  SEERR_STATUS_PATH,
  assertSeerrBaseUrl,
  assertSeerrEndpointAllowed,
} from "./policy";

describe("seerr policy", () => {
  it("requires an origin-only HTTP(S) URL", () => {
    expect(assertSeerrBaseUrl("https://seerr.lab:5055").origin).toBe("https://seerr.lab:5055");
    expect(() => assertSeerrBaseUrl("https://user:pass@seerr.lab:5055")).toThrow(/credentials/i);
    expect(() => assertSeerrBaseUrl("https://seerr.lab:5055/api")).toThrow(/origin/i);
    expect(() => assertSeerrBaseUrl("https://seerr.lab:5055/?next=/api/v1/request")).toThrow(
      /query or fragment/i,
    );
  });

  it("allows only the read-only Seerr endpoints and denies query-string secrets", () => {
    assertSeerrEndpointAllowed("GET", `https://seerr.lab:5055${SEERR_STATUS_PATH}`);
    assertSeerrEndpointAllowed("GET", `https://seerr.lab:5055${SEERR_REQUEST_COUNT_PATH}`);
    expect(() =>
      assertSeerrEndpointAllowed("GET", `https://seerr.lab:5055${SEERR_STATUS_PATH}?apikey=x`),
    ).toThrow(/not allowed/i);
    expect(() =>
      assertSeerrEndpointAllowed(
        "GET",
        `https://seerr.lab:5055${SEERR_REQUEST_COUNT_PATH}?api_key=secret`,
      ),
    ).toThrow(/not allowed/i);
    expect(() =>
      assertSeerrEndpointAllowed("POST", `https://seerr.lab:5055${SEERR_STATUS_PATH}`),
    ).toThrow(/method/i);
    expect(() =>
      assertSeerrEndpointAllowed("POST", "https://seerr.lab:5055/api/v1/request"),
    ).toThrow(/method/i);
    expect(() =>
      assertSeerrEndpointAllowed("GET", "https://seerr.lab:5055/api/v1/request"),
    ).toThrow(/allowlist/i);
    expect(() => assertSeerrEndpointAllowed("GET", "https://seerr.lab:5055/api/v1/user")).toThrow(
      /allowlist/i,
    );
    expect(() =>
      assertSeerrEndpointAllowed(
        "GET",
        `https://seerr.lab:5055${SEERR_REQUEST_COUNT_PATH}/%2e%2e/request`,
      ),
    ).toThrow(/traversal/i);
    expect(() =>
      assertSeerrEndpointAllowed("GET", "https://seerr.lab:5055/api/v1//request/count"),
    ).toThrow(/traversal/i);
  });
});
