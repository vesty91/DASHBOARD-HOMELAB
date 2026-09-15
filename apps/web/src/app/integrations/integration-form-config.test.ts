import { describe, expect, it } from "vitest";
import { configFromForm } from "./integration-form-config";

describe("configFromForm", () => {
  it("omits blank trustedCaPem and keeps PEM inner whitespace", () => {
    const blank = new FormData();
    blank.set("verifyTls", "on");
    blank.set("timeoutMs", "8000");
    blank.set("trustedCaPem", "   \n");
    expect(configFromForm(blank)).toEqual({ verifyTls: true, timeoutMs: 8000 });
    const pem = new FormData();
    pem.set("verifyTls", "on");
    pem.set("timeoutMs", "8000");
    pem.set("trustedCaPem", "-----BEGIN CERTIFICATE-----\nABC  \n-----END CERTIFICATE-----");
    expect(configFromForm(pem).trustedCaPem).toBe(
      "-----BEGIN CERTIFICATE-----\nABC  \n-----END CERTIFICATE-----",
    );
  });

  it("includes a trimmed Beszel identity without treating it as a secret", () => {
    const form = new FormData();
    form.set("verifyTls", "on");
    form.set("timeoutMs", "8000");
    form.set("identity", " ops@lab.example ");
    expect(configFromForm(form)).toEqual({
      verifyTls: true,
      timeoutMs: 8000,
      identity: "ops@lab.example",
    });
  });

  it("includes a trimmed Synology account without treating it as a secret", () => {
    const form = new FormData();
    form.set("verifyTls", "on");
    form.set("timeoutMs", "8000");
    form.set("account", " monitor ");
    expect(configFromForm(form)).toEqual({
      verifyTls: true,
      timeoutMs: 8000,
      account: "monitor",
    });
  });

  it("parses Custom API endpoints JSON and keeps invalid JSON for server-side Zod", () => {
    const valid = new FormData();
    valid.set("verifyTls", "on");
    valid.set("timeoutMs", "8000");
    valid.set("endpoints", '[{"key":"status","label":"Status","path":"/status"}]');
    valid.set("apiKeyHeader", "X-Api-Key");
    expect(configFromForm(valid)).toEqual({
      verifyTls: true,
      timeoutMs: 8000,
      endpoints: [{ key: "status", label: "Status", path: "/status" }],
      apiKeyHeader: "X-Api-Key",
    });
    const invalid = new FormData();
    invalid.set("verifyTls", "on");
    invalid.set("timeoutMs", "8000");
    invalid.set("endpoints", "not-json");
    expect(configFromForm(invalid)).toEqual({
      verifyTls: true,
      timeoutMs: 8000,
      endpoints: "not-json",
    });
  });
});
