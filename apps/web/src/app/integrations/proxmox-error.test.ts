import { describe, expect, it } from "vitest";
import { proxmoxUserError } from "./proxmox-error";

describe("proxmoxUserError", () => {
  it("maps known codes without reflecting secrets", () => {
    expect(proxmoxUserError({ code: "UNAUTHORIZED" })).toBe("Jeton API Proxmox invalide.");
    expect(proxmoxUserError({ code: "TIMEOUT" })).toBe("Délai dépassé vers Proxmox.");
    expect(proxmoxUserError({ code: "DNS_ERROR" })).toBe(
      "Le serveur Proxmox est injoignable (DNS).",
    );
    expect(proxmoxUserError({ code: "TLS_ERROR" })).toContain("TLS");
    expect(proxmoxUserError({ code: "UNREACHABLE" })).toBe("Le serveur Proxmox est injoignable.");
    expect(proxmoxUserError({ code: "TOO_MANY_REQUESTS" })).toContain("requêtes");
    expect(proxmoxUserError({ code: "CONFLICT" })).toContain("conflit");
    expect(proxmoxUserError({ message: "denied root@pam!dashboard=secret" })).not.toContain(
      "root@pam!dashboard=secret",
    );
  });
});
