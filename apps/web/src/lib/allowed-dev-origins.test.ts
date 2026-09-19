import { describe, expect, it } from "vitest";
import { parseAllowedDevOrigins } from "./allowed-dev-origins";

describe("parseAllowedDevOrigins", () => {
  it("defaults to localhost and 127.0.0.1 only", () => {
    expect(parseAllowedDevOrigins(undefined)).toEqual(["127.0.0.1", "localhost"]);
    expect(parseAllowedDevOrigins("")).toEqual(["127.0.0.1", "localhost"]);
    expect(parseAllowedDevOrigins("   ")).toEqual(["127.0.0.1", "localhost"]);
  });

  it("never embeds a machine-specific LAN IP in defaults", () => {
    expect(parseAllowedDevOrigins(undefined)).not.toContain("192.168.1.108");
  });

  it("merges optional ALLOWED_DEV_ORIGINS without dropping defaults", () => {
    expect(parseAllowedDevOrigins("dev.example.local, 10.0.0.2")).toEqual([
      "127.0.0.1",
      "localhost",
      "dev.example.local",
      "10.0.0.2",
    ]);
  });
});
