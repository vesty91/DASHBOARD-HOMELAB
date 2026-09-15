import { describe, expect, it } from "vitest";
import { qbittorrentUserError } from "./qbittorrent-error";

describe("qbittorrentUserError", () => {
  it("maps known codes without reflecting secrets", () => {
    expect(qbittorrentUserError({ code: "UNAUTHORIZED" })).toBe(
      "Identifiants qBittorrent invalides.",
    );
    expect(qbittorrentUserError({ code: "TIMEOUT" })).toBe("Délai dépassé vers qBittorrent.");
    expect(qbittorrentUserError({ code: "DNS_ERROR" })).toBe(
      "Le serveur qBittorrent est injoignable (DNS).",
    );
    expect(qbittorrentUserError({ code: "TLS_ERROR" })).toContain("TLS");
    expect(qbittorrentUserError({ code: "UNREACHABLE" })).toBe(
      "Le serveur qBittorrent est injoignable.",
    );
    expect(qbittorrentUserError({ code: "TOO_MANY_REQUESTS" })).toContain("requêtes");
    expect(qbittorrentUserError({ code: "VALIDATION_ERROR" })).toContain("invalides");
    expect(qbittorrentUserError({ code: "CONFLICT" })).toContain("conflit");
    expect(
      qbittorrentUserError({ message: "denied correct horse battery staple SID=abc" }),
    ).not.toContain("correct horse battery staple");
    expect(
      qbittorrentUserError({ message: "denied correct horse battery staple SID=abc" }),
    ).not.toContain("SID=");
  });
});
