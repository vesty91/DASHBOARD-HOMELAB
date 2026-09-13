import { describe, expect, it } from "vitest";
import {
  IMMICH_STATISTICS_PATH,
  IMMICH_VERSION_PATH,
  assertImmichBaseUrl,
  assertImmichEndpointAllowed,
} from "./policy";

describe("immich policy", () => {
  it("requires an origin-only HTTP(S) base URL", () => {
    expect(assertImmichBaseUrl("https://immich.lab:2283").origin).toBe("https://immich.lab:2283");
    expect(() => assertImmichBaseUrl("https://user:pass@immich.lab")).toThrow(/credentials/i);
    expect(() => assertImmichBaseUrl("https://immich.lab/api")).toThrow(/origin/i);
  });

  it("allows only the Phase 11 GET allowlist", () => {
    assertImmichEndpointAllowed("GET", `https://immich.lab${IMMICH_VERSION_PATH}`);
    assertImmichEndpointAllowed("GET", `https://immich.lab${IMMICH_STATISTICS_PATH}`);
    expect(() =>
      assertImmichEndpointAllowed("GET", `https://immich.lab${IMMICH_VERSION_PATH}?apiKey=secret`),
    ).toThrow(/query/i);
    expect(() =>
      assertImmichEndpointAllowed("POST", `https://immich.lab${IMMICH_VERSION_PATH}`),
    ).toThrow(/method/i);
    expect(() => assertImmichEndpointAllowed("GET", "https://immich.lab/api/assets")).toThrow(
      /allowlist/i,
    );
  });
});
