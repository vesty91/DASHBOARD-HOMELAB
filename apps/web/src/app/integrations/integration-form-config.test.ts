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
});
