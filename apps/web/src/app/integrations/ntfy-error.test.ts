import { describe, expect, it } from "vitest";
import { ntfyUserError } from "./ntfy-error";

describe("ntfyUserError", () => {
  it("maps known codes without reflecting secrets", () => {
    expect(ntfyUserError({ code: "UNAUTHORIZED" })).toBe("Jeton d'accès ntfy invalide.");
    expect(ntfyUserError({ code: "TIMEOUT" })).toBe("Délai dépassé vers ntfy.");
    expect(ntfyUserError({ code: "DNS_ERROR" })).toBe("Le serveur ntfy est injoignable (DNS).");
    expect(ntfyUserError({ code: "TLS_ERROR" })).toContain("TLS");
    expect(ntfyUserError({ code: "UNREACHABLE" })).toBe("Le serveur ntfy est injoignable.");
    expect(ntfyUserError({ code: "TOO_MANY_REQUESTS" })).toContain("requêtes");
    expect(ntfyUserError({ message: "denied tk_secretAccessToken012345" })).not.toContain(
      "tk_secretAccessToken012345",
    );
  });
});
