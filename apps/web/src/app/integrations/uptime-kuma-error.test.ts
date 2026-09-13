import { describe, expect, it } from "vitest";
import { uptimeKumaUserError } from "./uptime-kuma-error";

describe("uptimeKumaUserError", () => {
  it("maps known codes without reflecting secrets", () => {
    expect(uptimeKumaUserError({ code: "UNAUTHORIZED" })).toBe("Clé API Uptime Kuma invalide.");
    expect(uptimeKumaUserError({ code: "TIMEOUT" })).toBe("Délai dépassé vers Uptime Kuma.");
    expect(uptimeKumaUserError({ code: "DNS_ERROR" })).toBe(
      "Le serveur Uptime Kuma est injoignable (DNS).",
    );
    expect(uptimeKumaUserError({ code: "TLS_ERROR" })).toContain("TLS");
    expect(uptimeKumaUserError({ code: "UNREACHABLE" })).toBe(
      "Le serveur Uptime Kuma est injoignable.",
    );
    expect(uptimeKumaUserError({ code: "TOO_MANY_REQUESTS" })).toContain("actualisations");
    expect(uptimeKumaUserError({ message: "denied UK-API-SUPER-SECRET" })).not.toContain(
      "UK-API-SUPER-SECRET",
    );
  });
});
