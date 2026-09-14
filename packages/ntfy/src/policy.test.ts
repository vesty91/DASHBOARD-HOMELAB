import { describe, expect, it } from "vitest";
import {
  NTFY_HEALTH_PATH,
  NTFY_STATS_PATH,
  NTFY_VERSION_PATH,
  assertNtfyBaseUrl,
  assertNtfyEndpointAllowed,
} from "./policy";

describe("ntfy policy", () => {
  it("requires an origin-only HTTP(S) URL", () => {
    expect(assertNtfyBaseUrl("https://ntfy.lab").origin).toBe("https://ntfy.lab");
    expect(() => assertNtfyBaseUrl("https://user:pass@ntfy.lab")).toThrow(/credentials/i);
    expect(() => assertNtfyBaseUrl("https://ntfy.lab/v1")).toThrow(/origin/i);
    expect(() => assertNtfyBaseUrl("https://ntfy.lab/?next=/v1/config")).toThrow(
      /query or fragment/i,
    );
  });

  it("allows only the read-only ntfy endpoints", () => {
    assertNtfyEndpointAllowed("GET", `https://ntfy.lab${NTFY_HEALTH_PATH}`);
    assertNtfyEndpointAllowed("GET", `https://ntfy.lab${NTFY_STATS_PATH}`);
    assertNtfyEndpointAllowed("GET", `https://ntfy.lab${NTFY_VERSION_PATH}`);
    expect(() =>
      assertNtfyEndpointAllowed("GET", `https://ntfy.lab${NTFY_HEALTH_PATH}?token=x`),
    ).toThrow(/not allowed/i);
    expect(() =>
      assertNtfyEndpointAllowed("GET", `https://ntfy.lab${NTFY_STATS_PATH}?access_token=secret`),
    ).toThrow(/not allowed/i);
    expect(() => assertNtfyEndpointAllowed("POST", `https://ntfy.lab${NTFY_HEALTH_PATH}`)).toThrow(
      /method/i,
    );
    expect(() => assertNtfyEndpointAllowed("GET", "https://ntfy.lab/v1/config")).toThrow(
      /allowlist/i,
    );
    expect(() => assertNtfyEndpointAllowed("GET", "https://ntfy.lab/metrics")).toThrow(
      /allowlist/i,
    );
    expect(() => assertNtfyEndpointAllowed("GET", "https://ntfy.lab/v1/account")).toThrow(
      /allowlist/i,
    );
    expect(() =>
      assertNtfyEndpointAllowed("GET", `https://ntfy.lab${NTFY_HEALTH_PATH}/%2e%2e/config`),
    ).toThrow(/traversal/i);
    expect(() => assertNtfyEndpointAllowed("GET", "https://ntfy.lab/v1//health")).toThrow(
      /traversal/i,
    );
  });
});
