import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  assertDockerContainerId,
  assertDockerEndpointAllowed,
  assertDockerProxyBaseUrl,
} from "./policy";

const ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const V = "1.55";

function url(path: string): string {
  return `http://socket-proxy:2375${path}`;
}

describe("Docker endpoint policy", () => {
  it("allows the exact Phase 8 allowlist", () => {
    expect(() => assertDockerEndpointAllowed("GET", url("/_ping"))).not.toThrow();
    expect(() => assertDockerEndpointAllowed("GET", url("/version"))).not.toThrow();
    expect(() =>
      assertDockerEndpointAllowed("GET", url(`/v${V}/containers/json?all=true&limit=100`)),
    ).not.toThrow();
    expect(() =>
      assertDockerEndpointAllowed("GET", url(`/v${V}/containers/${ID}/json`)),
    ).not.toThrow();
    expect(() =>
      assertDockerEndpointAllowed("GET", url(`/v${V}/containers/${ID}/stats?stream=false`)),
    ).not.toThrow();
    expect(() =>
      assertDockerEndpointAllowed(
        "GET",
        url(`/v${V}/containers/${ID}/logs?stdout=true&stderr=true&timestamps=true&tail=200`),
      ),
    ).not.toThrow();
    expect(() =>
      assertDockerEndpointAllowed("POST", url(`/v${V}/containers/${ID}/start`)),
    ).not.toThrow();
    expect(() =>
      assertDockerEndpointAllowed("POST", url(`/v${V}/containers/${ID}/stop?t=10`)),
    ).not.toThrow();
    expect(() =>
      assertDockerEndpointAllowed("POST", url(`/v${V}/containers/${ID}/restart?t=10`)),
    ).not.toThrow();
  });

  it("rejects dangerous and inventory endpoints before transport", () => {
    const denied = [
      `/v${V}/containers/${ID}/archive`,
      `/v${V}/containers/${ID}/export`,
      `/v${V}/containers/${ID}/top`,
      `/v${V}/containers/${ID}/changes`,
      `/v${V}/containers/${ID}/kill`,
      `/v${V}/containers/${ID}/exec`,
      `/v${V}/containers/${ID}/attach`,
      `/v${V}/containers/${ID}/remove`,
      `/v${V}/images/json`,
      `/v${V}/images/create`,
      `/v${V}/volumes`,
      `/v${V}/networks`,
      `/v${V}/swarm`,
      `/v${V}/containers/${ID}/json/extra`,
    ];
    for (const path of denied) {
      expect(() => assertDockerEndpointAllowed("GET", url(path))).toThrow(IntegrationError);
    }
  });

  it("rejects traversal, encoding, short ids and unexpected query", () => {
    expect(() =>
      assertDockerEndpointAllowed("GET", url(`/v${V}/containers/${ID}%2fjson`)),
    ).toThrow();
    expect(() =>
      assertDockerEndpointAllowed("GET", url(`/v${V}/containers/%2e%2e/json`)),
    ).toThrow();
    expect(() =>
      assertDockerEndpointAllowed("GET", url(`/v${V}/containers/${ID}/json/../export`)),
    ).toThrow();
    expect(() =>
      assertDockerEndpointAllowed("GET", url(`/v${V}/containers/${ID}/json?foo=1`)),
    ).toThrow();
    expect(() =>
      assertDockerEndpointAllowed(
        "GET",
        url(`/v${V}/containers/json?all=true&limit=100&all=false`),
      ),
    ).toThrow();
    expect(() =>
      assertDockerEndpointAllowed("GET", url(`/v${V}/containers/jellyfin/json`)),
    ).toThrow();
    expect(() =>
      assertDockerEndpointAllowed("GET", url(`/v${V}/containers/${ID.slice(0, 12)}/json`)),
    ).toThrow();
    expect(() =>
      assertDockerEndpointAllowed("GET", url(`/v${V}/containers/${ID.toUpperCase()}/json`)),
    ).toThrow();
    expect(() =>
      assertDockerEndpointAllowed(
        "GET",
        url(
          `/v${V}/containers/${ID}/logs?stdout=true&stderr=true&timestamps=true&tail=200&follow=true`,
        ),
      ),
    ).toThrow();
    expect(() => assertDockerContainerId("Jellyfin")).toThrow(/64 lowercase hex/);
    expect(() => assertDockerContainerId(ID)).not.toThrow();
  });

  it("accepts only the socket-proxy root as a base URL", () => {
    expect(assertDockerProxyBaseUrl("http://proxy:2375").href).toBe("http://proxy:2375/");
    expect(assertDockerProxyBaseUrl("http://proxy:2375/").href).toBe("http://proxy:2375/");
    expect(() => assertDockerProxyBaseUrl("http://proxy:2375/docker/")).toThrow(/root/);
    expect(() => assertDockerProxyBaseUrl("http://proxy:2375/?foo=bar")).toThrow();
    expect(() => assertDockerProxyBaseUrl("http://proxy:2375/#fragment")).toThrow();
    expect(() => assertDockerProxyBaseUrl("unix:///var/run/docker.sock")).toThrow();
  });
});
