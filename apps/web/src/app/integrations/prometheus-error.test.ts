import { describe, expect, it } from "vitest";
import { prometheusUserError } from "./prometheus-error";

describe("prometheusUserError", () => {
  it("maps known codes without reflecting secrets", () => {
    expect(prometheusUserError({ code: "UNAUTHORIZED" })).toBe("Jeton Bearer Prometheus invalide.");
    expect(prometheusUserError({ code: "TIMEOUT" })).toBe("Délai dépassé vers Prometheus.");
    expect(prometheusUserError({ code: "DNS_ERROR" })).toBe(
      "Le serveur Prometheus est injoignable (DNS).",
    );
    expect(prometheusUserError({ code: "TLS_ERROR" })).toContain("TLS");
    expect(prometheusUserError({ code: "UNREACHABLE" })).toBe(
      "Le serveur Prometheus est injoignable.",
    );
    expect(prometheusUserError({ code: "TOO_MANY_REQUESTS" })).toContain("actualisations");
    expect(prometheusUserError({ message: "denied PROM-BEARER-SUPER-SECRET" })).not.toContain(
      "PROM-BEARER-SUPER-SECRET",
    );
  });
});
