import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  INFO_QUERY,
  assertSynologyBaseUrl,
  assertSynologyCgiPath,
  assertSynologyEndpointAllowed,
} from "./policy";

function url(path: string): string {
  return `https://nas.example:5001${path}`;
}

describe("Synology endpoint policy", () => {
  it("allows only entry.cgi on the Phase 9 allowlist", () => {
    expect(() =>
      assertSynologyEndpointAllowed(
        "GET",
        url(`/webapi/entry.cgi?api=SYNO.API.Info&version=1&method=query&query=${INFO_QUERY}`),
      ),
    ).not.toThrow();
    const encodedQuery = new URL("https://nas.example:5001/webapi/entry.cgi");
    encodedQuery.search = new URLSearchParams({
      api: "SYNO.API.Info",
      version: "1",
      method: "query",
      query: INFO_QUERY,
    }).toString();
    expect(() => assertSynologyEndpointAllowed("GET", encodedQuery)).not.toThrow();
    expect(() => assertSynologyEndpointAllowed("POST", url("/webapi/entry.cgi"))).not.toThrow();
    expect(() =>
      assertSynologyEndpointAllowed(
        "GET",
        url("/webapi/entry.cgi?api=SYNO.DSM.Info&version=2&method=getinfo"),
      ),
    ).not.toThrow();
    expect(() =>
      assertSynologyEndpointAllowed(
        "GET",
        url("/webapi/entry.cgi?api=SYNO.Core.System&version=1&method=info"),
      ),
    ).not.toThrow();
    expect(() =>
      assertSynologyEndpointAllowed(
        "GET",
        url("/webapi/entry.cgi?api=SYNO.Core.System.Utilization&version=1&method=get"),
      ),
    ).not.toThrow();
    expect(() =>
      assertSynologyEndpointAllowed(
        "GET",
        url("/webapi/entry.cgi?api=SYNO.Storage.CGI.Storage&version=1&method=load_info"),
      ),
    ).not.toThrow();
  });

  it("rejects query.cgi, auth.cgi, query=all, credentials in the URL and write APIs", () => {
    const denied = [
      `/webapi/query.cgi?api=SYNO.API.Info&version=1&method=query&query=${INFO_QUERY}`,
      "/webapi/entry.cgi?api=SYNO.API.Info&version=1&method=query&query=all",
      "/webapi/entry.cgi?api=SYNO.API.Auth&version=3&method=login&account=a&passwd=b",
      "/webapi/entry.cgi?api=SYNO.Core.System&version=1&method=reboot",
      "/webapi/entry.cgi?api=SYNO.Core.System&version=1&method=shutdown",
      "/webapi/entry.cgi?api=SYNO.FileStation.List&version=1&method=list",
      "/webapi/entry.cgi?api=SYNO.Core.User&version=1&method=list",
      `/webapi/entry.cgi?api=SYNO.API.Info&version=1&method=query&query=${INFO_QUERY}&_sid=secret`,
    ];
    for (const path of denied) {
      expect(() => assertSynologyEndpointAllowed("GET", url(path))).toThrow(IntegrationError);
    }
    expect(() => assertSynologyEndpointAllowed("POST", url("/webapi/auth.cgi"))).toThrow(
      IntegrationError,
    );
    expect(() =>
      assertSynologyEndpointAllowed("POST", url("/webapi/entry.cgi?passwd=secret")),
    ).toThrow(IntegrationError);
  });

  it("rejects traversal, extra CGI and credentials in the base URL", () => {
    expect(() =>
      assertSynologyEndpointAllowed("GET", url("/webapi/entry.cgi/../auth.cgi")),
    ).toThrow();
    expect(() => assertSynologyEndpointAllowed("GET", url("/webapi/download.cgi"))).toThrow();
    expect(() => assertSynologyCgiPath("auth.cgi")).toThrow(IntegrationError);
    expect(() => assertSynologyCgiPath("query.cgi")).toThrow(IntegrationError);
    expect(() => assertSynologyBaseUrl("https://user:pass@nas.example:5001/")).toThrow(
      IntegrationError,
    );
    expect(() => assertSynologyBaseUrl("https://nas.example:5001/dsm")).toThrow(IntegrationError);
    expect(assertSynologyBaseUrl("https://nas.example:5001/").origin).toBe(
      "https://nas.example:5001",
    );
  });
});
