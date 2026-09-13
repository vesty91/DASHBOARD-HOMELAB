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
});
