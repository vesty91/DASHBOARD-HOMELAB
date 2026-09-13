import { describe, expect, it } from "vitest";
import { immichUserError } from "./immich-error";

describe("immichUserError", () => {
  it("maps transport and auth codes without reflecting secrets", () => {
    expect(immichUserError({ code: "UNAUTHORIZED" })).toBe("Clé API Immich invalide.");
    expect(immichUserError({ code: "TIMEOUT" })).toBe("Délai dépassé vers Immich.");
    expect(immichUserError({ code: "DNS_ERROR" })).toBe("Le serveur Immich est injoignable (DNS).");
    expect(immichUserError({ code: "TLS_ERROR" })).toContain("TLS");
    expect(immichUserError({ code: "UNREACHABLE" })).toBe("Le serveur Immich est injoignable.");
    expect(immichUserError({ code: "TOO_MANY_REQUESTS" })).toContain("actualisations");
    expect(immichUserError({ message: "denied IM-API-SUPER-SECRET" })).not.toContain(
      "IM-API-SUPER-SECRET",
    );
  });
});
