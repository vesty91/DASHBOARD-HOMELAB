/**
 * Native HTML attributes for the local credentials form.
 * Without an explicit method, browsers default to GET and put fields in the query string.
 */
export const LOGIN_CREDENTIALS_FORM = {
  method: "post",
  action: "/api/auth/callback/credentials",
  callbackUrl: "/admin",
} as const;

/** True when a browser would serialize named fields into the request URL (unsafe for passwords). */
export function credentialsWouldLeakInRequestUrl(form: { method?: string | null }): boolean {
  const method = (form.method ?? "get").trim().toLowerCase();
  return method === "" || method === "get";
}

/** Credential-like query params must never linger on /login (history / referrer). */
export function hasCredentialQueryLeak(params: { password?: string; username?: string }): boolean {
  if (typeof params.username === "string") return true;
  return typeof params.password === "string" && params.password !== "changed";
}
