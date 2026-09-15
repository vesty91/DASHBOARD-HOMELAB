import { describe, expect, it } from "vitest";
import { prowlarrUserError } from "./prowlarr-error";

describe("prowlarrUserError", () => {
  it("maps known codes without reflecting secrets", () => {
    expect(prowlarrUserError({ code: "UNAUTHORIZED" })).toBe("Clé API Prowlarr invalide.");
    expect(prowlarrUserError({ code: "TIMEOUT" })).toBe("Délai dépassé vers Prowlarr.");
    expect(prowlarrUserError({ code: "DNS_ERROR" })).toBe(
      "Le serveur Prowlarr est injoignable (DNS).",
    );
    expect(prowlarrUserError({ code: "TLS_ERROR" })).toContain("TLS");
    expect(prowlarrUserError({ code: "UNREACHABLE" })).toBe("Le serveur Prowlarr est injoignable.");
    expect(prowlarrUserError({ code: "TOO_MANY_REQUESTS" })).toContain("actualisations");
    expect(
      prowlarrUserError({ message: "denied notareal-prowlarr-apikey-0123456789" }),
    ).not.toContain("notareal-prowlarr-apikey-0123456789");
  });
});
