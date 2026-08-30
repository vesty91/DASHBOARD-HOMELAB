import { describe, expect, it } from "vitest";
import { dockerActionFailure } from "./docker-action-result";

describe("dockerActionFailure", () => {
  it("returns an isolated user message instead of throwing", () => {
    expect(dockerActionFailure({ code: "TIMEOUT" })).toEqual({
      ok: false,
      message: "Délai dépassé vers le socket proxy Docker.",
    });
    expect(dockerActionFailure({ code: "RATE_LIMITED" }).ok).toBe(false);
    expect(
      dockerActionFailure({
        code: "FORBIDDEN",
        message: "L'accès aux logs n'est pas autorisé par le socket proxy.",
      }).message,
    ).toMatch(/proxy/);
  });
});
