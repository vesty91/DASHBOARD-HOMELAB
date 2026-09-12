import { describe, expect, it } from "vitest";
import { synologyUserError } from "./synology-error";

describe("synologyUserError", () => {
  it("maps TLS and 2FA without exposing secrets", () => {
    expect(synologyUserError({ code: "TLS_ERROR", message: "certificate" })).toMatch(/TLS/u);
    expect(
      synologyUserError({
        code: "MISCONFIGURED",
        message: "L'authentification DSM à deux facteurs n'est pas supportée.",
      }),
    ).toMatch(/deux facteurs/u);
    expect(synologyUserError({ code: "UNAUTHORIZED", message: "sid=SECRET" })).not.toMatch(/sid=/u);
  });
});
