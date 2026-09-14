import { describe, expect, it } from "vitest";
import { radarrUserError } from "./radarr-error";

describe("radarrUserError", () => {
  it("maps known codes without reflecting secrets", () => {
    expect(radarrUserError({ code: "UNAUTHORIZED" })).toBe("Clé API Radarr invalide.");
    expect(radarrUserError({ code: "TIMEOUT" })).toBe("Délai dépassé vers Radarr.");
    expect(radarrUserError({ code: "DNS_ERROR" })).toBe("Le serveur Radarr est injoignable (DNS).");
    expect(radarrUserError({ code: "TLS_ERROR" })).toContain("TLS");
    expect(radarrUserError({ code: "UNREACHABLE" })).toBe("Le serveur Radarr est injoignable.");
    expect(radarrUserError({ code: "TOO_MANY_REQUESTS" })).toContain("actualisations");
    expect(radarrUserError({ message: "denied notareal-radarr-apikey-0123456789" })).not.toContain(
      "notareal-radarr-apikey-0123456789",
    );
  });
});
