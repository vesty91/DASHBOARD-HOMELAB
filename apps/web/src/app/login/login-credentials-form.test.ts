import { describe, expect, it } from "vitest";
import {
  LOGIN_CREDENTIALS_FORM,
  credentialsWouldLeakInRequestUrl,
  hasCredentialQueryLeak,
} from "./login-credentials-form";

describe("login credentials form security", () => {
  it("fails closed for the historical missing-method GET default", () => {
    // Old LoginForm omitted method → browser GET → ?username=&password= in the URL.
    expect(credentialsWouldLeakInRequestUrl({})).toBe(true);
    expect(credentialsWouldLeakInRequestUrl({ method: null })).toBe(true);
    expect(credentialsWouldLeakInRequestUrl({ method: "GET" })).toBe(true);
  });

  it("uses POST to NextAuth credentials so fields cannot become a query string", () => {
    expect(LOGIN_CREDENTIALS_FORM.method).toBe("post");
    expect(credentialsWouldLeakInRequestUrl(LOGIN_CREDENTIALS_FORM)).toBe(false);
    expect(LOGIN_CREDENTIALS_FORM.action).toBe("/api/auth/callback/credentials");
    expect(LOGIN_CREDENTIALS_FORM.callbackUrl).toBe("/admin");
  });

  it("treats username/password query params as a credential leak except password=changed", () => {
    expect(hasCredentialQueryLeak({ username: "alice" })).toBe(true);
    expect(hasCredentialQueryLeak({ password: "not-a-real-secret" })).toBe(true);
    expect(hasCredentialQueryLeak({ password: "changed" })).toBe(false);
    expect(hasCredentialQueryLeak({})).toBe(false);
  });
});
