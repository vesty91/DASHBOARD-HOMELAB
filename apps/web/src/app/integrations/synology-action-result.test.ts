import { describe, expect, it } from "vitest";
import { synologyActionFailure } from "./synology-action-result";

describe("synologyActionFailure", () => {
  it("maps rate limits and TLS failures", () => {
    expect(synologyActionFailure({ code: "RATE_LIMITED" })).toEqual({
      ok: false,
      message: "Trop d'actualisations Synology. Réessayez dans une minute.",
    });
    expect(synologyActionFailure({ code: "TLS_ERROR" }).ok).toBe(false);
  });
});
