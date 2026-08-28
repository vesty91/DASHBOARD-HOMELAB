import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { isAllowedIntegrationAddress, secureRequest, type AddressResolver } from "./http-client";
import { parseIntegrationUrl } from "./urls";

const servers: http.Server[] = [];
afterEach(async () =>
  Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  ),
);

async function makeServer(handler: http.RequestListener) {
  const instance = http.createServer(handler);
  servers.push(instance);
  await new Promise<void>((resolve) => instance.listen(0, "127.0.0.1", resolve));
  const address = instance.address();
  if (!address || typeof address === "string") throw new Error("Test server unavailable");
  return { url: new URL(`http://integration.test:${address.port}/health`), port: address.port };
}

const localResolver: AddressResolver = async () => [{ address: "127.0.0.1", family: 4 }];
const allowLocal = () => true;

describe("integration URL validation", () => {
  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://example.com",
    "http://user:pass@host/",
  ])("rejects %s", (value) => expect(() => parseIntegrationUrl(value)).toThrow());
  it.each(["https://192.168.1.5:5001", "http://10.0.0.10:3000", "https://service.home.arpa:8443"])(
    "accepts %s",
    (value) => expect(parseIntegrationUrl(value).protocol).toMatch(/^https?:$/),
  );
});

describe("SSRF policy", () => {
  it.each(["127.0.0.1", "169.254.169.254", "::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254"])(
    "blocks %s",
    (address) => expect(isAllowedIntegrationAddress(address)).toBe(false),
  );
  it.each(["192.168.1.5", "10.0.0.5", "172.16.0.1", "fd12::1"])("allows %s", (address) =>
    expect(isAllowedIntegrationAddress(address)).toBe(true),
  );
  it("blocks localhost, loopback, metadata DNS and credentials before connect", async () => {
    expect(await secureRequest({ url: "http://localhost/health", timeoutMs: 500 })).toMatchObject({
      code: "TARGET_BLOCKED",
    });
    expect(await secureRequest({ url: "http://127.0.0.1/health", timeoutMs: 500 })).toMatchObject({
      code: "TARGET_BLOCKED",
    });
    expect(await secureRequest({ url: "http://[::1]/health", timeoutMs: 500 })).toMatchObject({
      code: "TARGET_BLOCKED",
    });
    expect(
      await secureRequest({
        url: "http://safe.example/health",
        timeoutMs: 500,
        resolver: async () => [{ address: "169.254.169.254", family: 4 }],
      }),
    ).toMatchObject({ code: "TARGET_BLOCKED" });
  });
});

describe("secure HTTP client", () => {
  it("returns JSON success without following redirects and pins DNS", async () => {
    const { url } = await makeServer((_request, response) => {
      response.writeHead(200, {
        "content-type": "application/json",
        location: "http://169.254.169.254/",
      });
      response.end(JSON.stringify({ ok: true }));
    });
    let resolutions = 0;
    const resolver: AddressResolver = async () => {
      resolutions += 1;
      return resolutions === 1
        ? [{ address: "127.0.0.1", family: 4 }]
        : [{ address: "169.254.169.254", family: 4 }];
    };
    const result = await secureRequest({
      url,
      timeoutMs: 1000,
      resolver,
      allowAddress: allowLocal,
      maxRetries: 0,
    });
    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(resolutions).toBe(1);
  });

  it("classifies timeout, closed sockets and oversized bodies", async () => {
    const hanging = await makeServer(() => undefined);
    expect(
      await secureRequest({
        url: hanging.url,
        timeoutMs: 50,
        resolver: localResolver,
        allowAddress: allowLocal,
      }),
    ).toMatchObject({ code: "TIMEOUT" });
    const closed = await makeServer((request) => request.socket.destroy());
    expect(
      await secureRequest({
        url: closed.url,
        timeoutMs: 500,
        resolver: localResolver,
        allowAddress: allowLocal,
      }),
    ).toMatchObject({ code: "UNREACHABLE" });
    const huge = await makeServer((_request, response) => {
      response.writeHead(200);
      response.end("x".repeat(2_000_000));
    });
    expect(
      await secureRequest({
        url: huge.url,
        timeoutMs: 1000,
        maxBodyBytes: 1024,
        resolver: localResolver,
        allowAddress: allowLocal,
      }),
    ).toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("does not set NODE_TLS_REJECT_UNAUTHORIZED when TLS verification is disabled", async () => {
    const before = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    await secureRequest({
      url: "https://192.168.1.5:9/",
      timeoutMs: 500,
      verifyTls: false,
    });
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe(before);
  });
});
