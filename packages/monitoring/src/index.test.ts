import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { isAllowedHealthAddress, probeHttp, type AddressResolver } from "./index";

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
  return new URL(`http://health.test:${address.port}/health`);
}
const localResolver: AddressResolver = async () => [{ address: "127.0.0.1", family: 4 }];
const testPolicy = () => true;

describe("health target policy", () => {
  it.each([
    "127.0.0.1",
    "169.254.169.254",
    "0.0.0.0",
    "::",
    "::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "::ffff:7f00:1",
    "100.100.100.200",
    "::ffff:100.100.100.200",
    "fd00:ec2::254",
    "FD00:EC2::254",
    "fd00:ec2:0:0:0:0:0:254",
    "fd00:0ec2:0000:0000:0000:0000:0000:0254",
  ])("blocks %s", (address) => expect(isAllowedHealthAddress(address)).toBe(false));
  it.each([
    "192.168.1.5",
    "10.0.0.5",
    "172.16.0.1",
    "100.64.0.1",
    "100.64.12.34",
    "fc00::1",
    "fd12::1",
  ])("allows %s", (address) => expect(isAllowedHealthAddress(address)).toBe(true));
  it("blocks localhost and metadata resolved through DNS", async () => {
    const common = {
      method: "GET" as const,
      timeoutMs: 500,
      expectedStatusMin: 200,
      expectedStatusMax: 399,
    };
    expect((await probeHttp({ ...common, url: new URL("http://localhost") })).errorCode).toBe(
      "TARGET_BLOCKED",
    );
    expect(
      (
        await probeHttp({
          ...common,
          url: new URL("http://safe.example"),
          resolver: async () => [{ address: "169.254.169.254", family: 4 }],
        })
      ).errorCode,
    ).toBe("TARGET_BLOCKED");
    expect(
      (
        await probeHttp({
          ...common,
          url: new URL("http://alibaba-metadata.example"),
          resolver: async () => [{ address: "100.100.100.200", family: 4 }],
        })
      ).errorCode,
    ).toBe("TARGET_BLOCKED");
    expect(
      (
        await probeHttp({
          ...common,
          url: new URL("http://aws-imds.example"),
          resolver: async () => [{ address: "fd00:ec2::254", family: 6 }],
        })
      ).errorCode,
    ).toBe("TARGET_BLOCKED");
  });
  it("bounds DNS resolution by the configured timeout", async () => {
    const result = await probeHttp({
      url: new URL("http://slow.example"),
      method: "GET",
      timeoutMs: 50,
      expectedStatusMin: 200,
      expectedStatusMax: 399,
      resolver: () => new Promise(() => undefined),
    });
    expect(result).toMatchObject({ status: "timeout", errorCode: "TIMEOUT" });
  });
  it("handles a bracketed ULA IPv6 literal without DNS", async () => {
    let resolved = false;
    const result = await probeHttp({
      url: new URL("http://[fd12::1]/"),
      method: "GET",
      timeoutMs: 50,
      expectedStatusMin: 200,
      expectedStatusMax: 399,
      resolver: async () => {
        resolved = true;
        return [];
      },
    });
    expect(resolved).toBe(false);
    expect(result.errorCode).not.toBe("DNS_ERROR");
  });
});

describe("HTTP probe", () => {
  it.each([
    [204, "up"],
    [500, "down"],
    [302, "up"],
  ] as const)("classifies %s as %s without following redirects", async (code, status) => {
    const url = await makeServer((_request, response) => {
      response.writeHead(code, { location: "http://169.254.169.254/" });
      response.end();
    });
    const result = await probeHttp({
      url,
      method: "GET",
      timeoutMs: 1000,
      expectedStatusMin: 200,
      expectedStatusMax: 399,
      resolver: localResolver,
      allowAddress: testPolicy,
    });
    expect(result).toMatchObject({ status, httpStatus: code });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
  it("uses exactly one validated DNS resolution", async () => {
    const url = await makeServer((_request, response) => response.writeHead(204).end());
    let resolutions = 0;
    const resolver: AddressResolver = async () => {
      resolutions++;
      return resolutions === 1
        ? [{ address: "127.0.0.1", family: 4 }]
        : [{ address: "169.254.169.254", family: 4 }];
    };
    expect(
      (
        await probeHttp({
          url,
          method: "GET",
          timeoutMs: 1000,
          expectedStatusMin: 200,
          expectedStatusMax: 399,
          resolver,
          allowAddress: testPolicy,
        })
      ).status,
    ).toBe("up");
    expect(resolutions).toBe(1);
  });
  it("returns timeout", async () => {
    const url = await makeServer(() => undefined);
    expect(
      (
        await probeHttp({
          url,
          method: "GET",
          timeoutMs: 50,
          expectedStatusMin: 200,
          expectedStatusMax: 399,
          resolver: localResolver,
          allowAddress: testPolicy,
        })
      ).status,
    ).toBe("timeout");
  });
});
