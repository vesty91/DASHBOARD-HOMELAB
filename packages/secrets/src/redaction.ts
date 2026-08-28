const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "secret",
  "apikey",
  "authorization",
  "cookie",
  "setcookie",
  "clientsecret",
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/gu, "");
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normalizeKey(key));
}

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>))
      output[key] = isSensitiveKey(key) ? "[REDACTED]" : redact(entry);
    return output;
  }
  return value;
}
