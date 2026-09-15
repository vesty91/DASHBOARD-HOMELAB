export const requiredHttpsHeaderNames = [
  "content-security-policy",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "strict-transport-security",
];

function headerMap(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

export function missingSecurityHeaders(headers, { https }) {
  const lower = headerMap(headers);
  const required = [
    "content-security-policy",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
  ];
  if (https) required.push("strict-transport-security");
  return required.filter((name) => !lower[name]);
}

export function assertCsp(value) {
  if (!value?.includes("default-src 'self'")) {
    throw new Error("CSP missing default-src 'self'");
  }
  if (!value.includes("frame-ancestors 'none'")) {
    throw new Error("CSP missing frame-ancestors 'none'");
  }
  if (value.includes("unsafe-eval")) {
    throw new Error("CSP allows unsafe-eval");
  }
}

export function isHttpsRedirect(status, location, publicOrigin) {
  if (![301, 302, 307, 308].includes(status)) return false;
  if (!location) return false;
  try {
    const resolved = new URL(location, publicOrigin);
    return resolved.protocol === "https:" && resolved.origin === new URL(publicOrigin).origin;
  } catch {
    return false;
  }
}

export function cookieFlagReport(setCookie) {
  const lines = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return lines.map((line) => {
    const segments = line.split(";").map((part) => part.trim());
    const name = segments[0]?.split("=")[0] ?? "";
    const flags = new Set(segments.slice(1).map((part) => part.split("=")[0]?.toLowerCase() ?? ""));
    const sameSite = segments.find((part) => part.toLowerCase().startsWith("samesite="));
    return {
      name,
      httpOnly: flags.has("httponly"),
      secure: flags.has("secure"),
      sameSite: sameSite ? sameSite.split("=")[1] : undefined,
    };
  });
}

export function sessionCookieViolations(cookies) {
  const violations = [];
  for (const cookie of cookies) {
    const sessionLike = /session-token/iu.test(cookie.name);
    const securePrefixed = cookie.name.startsWith("__Secure-") || cookie.name.startsWith("__Host-");
    if (!sessionLike && !securePrefixed) continue;
    if (!cookie.secure) violations.push(`${cookie.name} missing Secure`);
    if (sessionLike && !cookie.httpOnly) violations.push(`${cookie.name} missing HttpOnly`);
    if (cookie.sameSite && cookie.sameSite.toLowerCase() !== "lax") {
      violations.push(`${cookie.name} SameSite=${cookie.sameSite}`);
    }
  }
  return violations;
}
