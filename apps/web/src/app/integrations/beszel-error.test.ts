import { describe, expect, it } from "vitest";
import { beszelUserError } from "./beszel-error";

describe("beszelUserError", () => {
  it("maps known codes without reflecting secrets", () => {
    expect(beszelUserError({ code: "UNAUTHORIZED" })).toBe(
      "Identifiant ou mot de passe Beszel invalide.",
    );
    expect(beszelUserError({ code: "TIMEOUT" })).toBe("Délai dépassé vers Beszel.");
    expect(beszelUserError({ code: "DNS_ERROR" })).toBe("Le serveur Beszel est injoignable (DNS).");
    expect(beszelUserError({ code: "TLS_ERROR" })).toContain("TLS");
    expect(beszelUserError({ code: "UNREACHABLE" })).toBe("Le serveur Beszel est injoignable.");
    expect(beszelUserError({ code: "TOO_MANY_REQUESTS" })).toContain("actualisations");
    expect(beszelUserError({ message: "denied BZ-API-SUPER-SECRET" })).not.toContain(
      "BZ-API-SUPER-SECRET",
    );
  });
});
