import { describe, expect, it } from "vitest";
import { seerrUserError } from "./seerr-error";

describe("seerrUserError", () => {
  it("maps known codes without reflecting secrets", () => {
    expect(seerrUserError({ code: "UNAUTHORIZED" })).toBe("Clé API Seerr invalide.");
    expect(seerrUserError({ code: "TIMEOUT" })).toBe("Délai dépassé vers Seerr.");
    expect(seerrUserError({ code: "DNS_ERROR" })).toBe("Le serveur Seerr est injoignable (DNS).");
    expect(seerrUserError({ code: "TLS_ERROR" })).toContain("TLS");
    expect(seerrUserError({ code: "UNREACHABLE" })).toBe("Le serveur Seerr est injoignable.");
    expect(seerrUserError({ code: "TOO_MANY_REQUESTS" })).toContain("requêtes");
    expect(seerrUserError({ code: "CONFLICT" })).toContain("conflit");
    expect(seerrUserError({ code: "VALIDATION_ERROR" })).toContain("invalides");
    expect(seerrUserError({ code: "RATE_LIMITED" })).toContain("requêtes");
    expect(seerrUserError({ message: "denied notareal-seerr-apikey-0123456789" })).not.toContain(
      "notareal-seerr-apikey-0123456789",
    );
  });
});
