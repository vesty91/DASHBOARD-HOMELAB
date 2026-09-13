import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  JELLYFIN_SESSIONS_PATH,
  JELLYFIN_SYSTEM_INFO_PATH,
  assertJellyfinBaseUrl,
  assertJellyfinEndpointAllowed,
} from "./policy";

describe("assertJellyfinBaseUrl", () => {
  it("accepts an HTTP(S) origin", () => {
    expect(assertJellyfinBaseUrl("https://jellyfin.lab/").origin).toBe("https://jellyfin.lab");
  });

  it.each([
    "ftp://jellyfin.lab",
    "https://user:pass@jellyfin.lab",
    "https://jellyfin.lab/path",
    "https://jellyfin.lab/?q=1",
    "https://127.0.0.1#frag",
  ])("rejects %s", (value) => {
    expect(() => assertJellyfinBaseUrl(value)).toThrow(IntegrationError);
  });
});

describe("assertJellyfinEndpointAllowed", () => {
  it("allows System/Info and bounded Sessions queries", () => {
    expect(() =>
      assertJellyfinEndpointAllowed("GET", `https://jellyfin.lab${JELLYFIN_SYSTEM_INFO_PATH}`),
    ).not.toThrow();
    expect(() =>
      assertJellyfinEndpointAllowed(
        "GET",
        `https://jellyfin.lab${JELLYFIN_SESSIONS_PATH}?activeWithinSeconds=120`,
      ),
    ).not.toThrow();
  });

  it.each([
    ["POST", `https://jellyfin.lab${JELLYFIN_SYSTEM_INFO_PATH}`],
    ["GET", `https://jellyfin.lab/System/Info/Public`],
    ["GET", `https://jellyfin.lab${JELLYFIN_SYSTEM_INFO_PATH}?api_key=secret`],
    ["GET", `https://jellyfin.lab${JELLYFIN_SESSIONS_PATH}?activeWithinSeconds=120&deviceId=1`],
    ["GET", `https://jellyfin.lab/Users`],
    ["GET", `https://jellyfin.lab${JELLYFIN_SESSIONS_PATH}?activeWithinSeconds=9999`],
  ])("rejects %s %s", (method, url) => {
    expect(() => assertJellyfinEndpointAllowed(method, url)).toThrow(IntegrationError);
  });
});
