export function dashboardCsp(options?: { allowUnsafeEval?: boolean }): string {
  const scriptSrc = options?.allowUnsafeEval
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: http: https:",
    "font-src 'self'",
    "connect-src 'self' ws: wss:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}

export function securityHeaders(
  appUrl: string,
  options?: { allowUnsafeEval?: boolean },
): { key: string; value: string }[] {
  const headers: { key: string; value: string }[] = [
    { key: "Content-Security-Policy", value: dashboardCsp(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];
  if (appUrl.startsWith("https:")) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }
  return headers;
}

export function applyRuntimeSecurityHeaders(
  headers: { set(name: string, value: string): void },
  appUrl: string,
): void {
  for (const header of securityHeaders(appUrl)) {
    if (header.key === "Strict-Transport-Security") {
      headers.set(header.key, header.value);
    }
  }
}

export function serverActionAllowedOrigins(appUrl: string): string[] {
  return [new URL(appUrl).host];
}

export function isSameAppOrigin(originHeader: string | null, appUrl: string): boolean {
  if (!originHeader) return true;
  try {
    return new URL(originHeader).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
