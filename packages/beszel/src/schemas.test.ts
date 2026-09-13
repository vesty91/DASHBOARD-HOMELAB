import { describe, expect, it } from "vitest";
import {
  beszelAuthResponseSchema,
  beszelConfigSchema,
  beszelSecretSchema,
  beszelSystemRecordSchema,
} from "./schemas";

describe("beszel schemas", () => {
  it("accepts a valid hub config and rejects a control-character password", () => {
    expect(
      beszelConfigSchema.parse({
        identity: "monitor@lab.example",
        verifyTls: true,
        timeoutMs: 8000,
      }),
    ).toMatchObject({ identity: "monitor@lab.example" });
    expect(() => beszelSecretSchema.parse({ password: "bad\npass" })).toThrow(/visible ASCII/);
  });

  it("rejects auth tokens with control characters", () => {
    expect(beszelAuthResponseSchema.parse({ token: "eyJhbGciOiJIUzI1NiJ9.ok" }).token).toContain(
      "eyJ",
    );
    expect(() => beszelAuthResponseSchema.parse({ token: "abc\r\nInject" })).toThrow(
      /visible ASCII/,
    );
    expect(() => beszelAuthResponseSchema.parse({})).toThrow();
  });

  it("rejects unknown statuses and out-of-range metrics", () => {
    expect(() =>
      beszelSystemRecordSchema.parse({ id: "s1", name: "NAS", status: "healthy" }),
    ).toThrow();
    expect(() =>
      beszelSystemRecordSchema.parse({
        id: "s1",
        name: "NAS",
        status: "up",
        info: { cpu: 101 },
      }),
    ).toThrow();
    expect(() =>
      beszelSystemRecordSchema.parse({
        id: "s1",
        name: "NAS",
        status: "up",
        info: { mp: -1 },
      }),
    ).toThrow();
    expect(() =>
      beszelSystemRecordSchema.parse({
        id: "s1",
        name: "NAS",
        status: "up",
        info: { dp: Number.POSITIVE_INFINITY },
      }),
    ).toThrow();
    expect(() =>
      beszelSystemRecordSchema.parse({
        id: "s1",
        name: "NAS",
        status: "up",
        info: { bb: 1.5 },
      }),
    ).toThrow();
  });
});
