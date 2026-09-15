import { describe, expect, it } from "vitest";
import { assertCustomApiBaseUrl, assertCustomApiEndpointAllowed } from "./policy";

describe("custom-api policy", () => {
  it("requires an origin-only HTTP(S) URL", () => {
    expect(assertCustomApiBaseUrl("https://api.lab:8443").origin).toBe("https://api.lab:8443");
    expect(() => assertCustomApiBaseUrl("ftp://api.lab")).toThrow(/HTTP/i);
    expect(() => assertCustomApiBaseUrl("https://user:pass@api.lab")).toThrow(/credentials/i);
    expect(() => assertCustomApiBaseUrl("https://api.lab/status")).toThrow(/origin/i);
    expect(() => assertCustomApiBaseUrl("https://api.lab/?next=/status")).toThrow(
      /query or fragment/i,
    );
  });

  it("allows only GET paths from the admin allowlist", () => {
    assertCustomApiEndpointAllowed("GET", "https://api.lab/status", ["/status"]);
    expect(() =>
      assertCustomApiEndpointAllowed("POST", "https://api.lab/status", ["/status"]),
    ).toThrow(/method/i);
    expect(() =>
      assertCustomApiEndpointAllowed("GET", "https://api.lab/other", ["/status"]),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertCustomApiEndpointAllowed("GET", "https://api.lab/status?apikey=x", ["/status"]),
    ).toThrow(/not allowed/i);
    expect(() =>
      assertCustomApiEndpointAllowed("GET", "https://api.lab/status#frag", ["/status"]),
    ).toThrow(/fragment/i);
  });
});
