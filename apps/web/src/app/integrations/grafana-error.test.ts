import { describe, expect, it } from "vitest";
import { grafanaUserError } from "./grafana-error";

describe("grafanaUserError", () => {
  it("maps known codes without reflecting secrets", () => {
    expect(grafanaUserError({ code: "UNAUTHORIZED" })).toBe(
      "Jeton de compte de service Grafana invalide.",
    );
    expect(grafanaUserError({ code: "TIMEOUT" })).toBe("Délai dépassé vers Grafana.");
    expect(grafanaUserError({ code: "DNS_ERROR" })).toBe(
      "Le serveur Grafana est injoignable (DNS).",
    );
    expect(grafanaUserError({ code: "TLS_ERROR" })).toContain("TLS");
    expect(grafanaUserError({ code: "UNREACHABLE" })).toBe("Le serveur Grafana est injoignable.");
    expect(grafanaUserError({ code: "TOO_MANY_REQUESTS" })).toContain("actualisations");
    expect(
      grafanaUserError({ message: "denied glsa_secretServiceAccountToken012345" }),
    ).not.toContain("glsa_secretServiceAccountToken012345");
  });
});
