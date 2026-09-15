import { describe, expect, it } from "vitest";
import { sonarrUserError } from "./sonarr-error";

describe("sonarrUserError", () => {
  it("maps known codes without reflecting secrets", () => {
    expect(sonarrUserError({ code: "UNAUTHORIZED" })).toBe("Clé API Sonarr invalide.");
    expect(sonarrUserError({ code: "TIMEOUT" })).toBe("Délai dépassé vers Sonarr.");
    expect(sonarrUserError({ code: "DNS_ERROR" })).toBe("Le serveur Sonarr est injoignable (DNS).");
    expect(sonarrUserError({ code: "TLS_ERROR" })).toContain("TLS");
    expect(sonarrUserError({ code: "UNREACHABLE" })).toBe("Le serveur Sonarr est injoignable.");
    expect(sonarrUserError({ code: "TOO_MANY_REQUESTS" })).toContain("requêtes");
    expect(sonarrUserError({ code: "CONFLICT" })).toContain("conflit");
    expect(sonarrUserError({ code: "VALIDATION_ERROR" })).toContain("invalides");
    expect(sonarrUserError({ code: "RATE_LIMITED" })).toContain("requêtes");
    expect(sonarrUserError({ message: "denied notareal-sonarr-apikey-0123456789" })).not.toContain(
      "notareal-sonarr-apikey-0123456789",
    );
  });
});
