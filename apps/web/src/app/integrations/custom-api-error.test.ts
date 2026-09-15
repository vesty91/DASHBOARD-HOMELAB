import { describe, expect, it } from "vitest";
import { customApiUserError } from "./custom-api-error";

describe("customApiUserError", () => {
  it("maps integration errors to French messages without leaking secrets", () => {
    expect(customApiUserError({ code: "UNAUTHORIZED" })).toBe(
      "Identifiants de l'API personnalisée invalides.",
    );
    expect(customApiUserError({ code: "TIMEOUT" })).toBe("Délai dépassé vers l'API personnalisée.");
    expect(customApiUserError({ code: "DNS_ERROR" })).toBe(
      "Le serveur de l'API personnalisée est injoignable (DNS).",
    );
    expect(customApiUserError({ code: "TLS_ERROR" })).toContain("TLS");
    expect(customApiUserError({ code: "UNREACHABLE" })).toBe(
      "Le serveur de l'API personnalisée est injoignable.",
    );
    expect(customApiUserError({ code: "TOO_MANY_REQUESTS" })).toContain("actualisations");
    expect(
      customApiUserError({ message: "denied notareal-custom-api-secret-0123456789" }),
    ).not.toContain("notareal-custom-api-secret");
  });
});
