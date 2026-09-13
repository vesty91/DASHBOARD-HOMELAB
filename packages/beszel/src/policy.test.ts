import { describe, expect, it } from "vitest";
import {
  BESZEL_AUTH_PATH,
  BESZEL_SYSTEMS_PATH,
  assertBeszelBaseUrl,
  assertBeszelEndpointAllowed,
} from "./policy";

describe("beszel policy", () => {
  it("requires an origin-only HTTP(S) hub URL", () => {
    expect(assertBeszelBaseUrl("https://beszel.lab:8090").origin).toBe("https://beszel.lab:8090");
    expect(() => assertBeszelBaseUrl("https://user:pass@beszel.lab")).toThrow(/credentials/i);
    expect(() => assertBeszelBaseUrl("https://beszel.lab/api")).toThrow(/origin/i);
  });

  it("allows only the official auth and systems endpoints", () => {
    assertBeszelEndpointAllowed("POST", `https://beszel.lab${BESZEL_AUTH_PATH}`);
    assertBeszelEndpointAllowed(
      "GET",
      `https://beszel.lab${BESZEL_SYSTEMS_PATH}?page=1&perPage=50&fields=id,name`,
    );
    expect(() =>
      assertBeszelEndpointAllowed("POST", `https://beszel.lab${BESZEL_AUTH_PATH}?token=x`),
    ).toThrow(/query/i);
    expect(() =>
      assertBeszelEndpointAllowed("GET", `https://beszel.lab${BESZEL_SYSTEMS_PATH}?filter=1`),
    ).toThrow(/query/i);
    expect(() =>
      assertBeszelEndpointAllowed("PATCH", `https://beszel.lab/api/collections/systems/records/1`),
    ).toThrow(/method/i);
  });
});
