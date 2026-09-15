import { describe, expect, it } from "vitest";
import {
  QBITTORRENT_LOGIN_PATH,
  QBITTORRENT_LOGOUT_PATH,
  QBITTORRENT_TORRENTS_PATH,
  QBITTORRENT_TRANSFER_PATH,
  QBITTORRENT_VERSION_PATH,
  assertQbittorrentBaseUrl,
  assertQbittorrentEndpointAllowed,
} from "./policy";

describe("qbittorrent policy", () => {
  it("requires an origin-only HTTP(S) URL", () => {
    expect(assertQbittorrentBaseUrl("https://qbittorrent.lab:8080").origin).toBe(
      "https://qbittorrent.lab:8080",
    );
    expect(() => assertQbittorrentBaseUrl("https://user:pass@qbittorrent.lab:8080")).toThrow(
      /credentials/i,
    );
    expect(() => assertQbittorrentBaseUrl("https://qbittorrent.lab:8080/api")).toThrow(/origin/i);
    expect(() =>
      assertQbittorrentBaseUrl("https://qbittorrent.lab:8080/?next=/api/v2/auth/login"),
    ).toThrow(/query or fragment/i);
  });

  it("allows only the Phase 18 qBittorrent endpoints", () => {
    assertQbittorrentEndpointAllowed(
      "POST",
      `https://qbittorrent.lab:8080${QBITTORRENT_LOGIN_PATH}`,
    );
    assertQbittorrentEndpointAllowed(
      "POST",
      `https://qbittorrent.lab:8080${QBITTORRENT_LOGOUT_PATH}`,
    );
    assertQbittorrentEndpointAllowed(
      "GET",
      `https://qbittorrent.lab:8080${QBITTORRENT_VERSION_PATH}`,
    );
    assertQbittorrentEndpointAllowed(
      "GET",
      `https://qbittorrent.lab:8080${QBITTORRENT_TRANSFER_PATH}`,
    );
    assertQbittorrentEndpointAllowed(
      "GET",
      `https://qbittorrent.lab:8080${QBITTORRENT_TORRENTS_PATH}`,
    );
    expect(() =>
      assertQbittorrentEndpointAllowed(
        "GET",
        `https://qbittorrent.lab:8080${QBITTORRENT_LOGIN_PATH}`,
      ),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertQbittorrentEndpointAllowed(
        "GET",
        `https://qbittorrent.lab:8080${QBITTORRENT_VERSION_PATH}?apikey=secret`,
      ),
    ).toThrow(/not allowed/i);
    expect(() =>
      assertQbittorrentEndpointAllowed(
        "POST",
        `https://qbittorrent.lab:8080${QBITTORRENT_LOGIN_PATH}?password=secret`,
      ),
    ).toThrow(/not allowed/i);
    expect(() =>
      assertQbittorrentEndpointAllowed("POST", "https://qbittorrent.lab:8080/api/v2/torrents/add"),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertQbittorrentEndpointAllowed("GET", "https://qbittorrent.lab:8080/api/v2/sync/maindata"),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertQbittorrentEndpointAllowed(
        "GET",
        `https://qbittorrent.lab:8080${QBITTORRENT_TORRENTS_PATH}/%2e%2e/add`,
      ),
    ).toThrow(/traversal/i);
  });
});
