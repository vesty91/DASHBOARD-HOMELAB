import { describe, expect, it } from "vitest";
import { dockerUserError } from "./docker-error";

describe("dockerUserError", () => {
  it("maps nested Docker transport codes", () => {
    expect(dockerUserError({ code: "BAD_REQUEST", cause: { code: "DNS_ERROR" } })).toMatch(/DNS/);
    expect(dockerUserError({ code: "BAD_REQUEST", cause: { code: "TLS_ERROR" } })).toMatch(/TLS/);
    expect(dockerUserError({ code: "TIMEOUT" })).toMatch(/Délai/);
    expect(
      dockerUserError({
        code: "FORBIDDEN",
        message: "L'accès aux logs n'est pas autorisé par le socket proxy.",
      }),
    ).toMatch(/proxy/);
  });
});
