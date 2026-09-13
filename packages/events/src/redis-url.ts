export function redactRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    if (parsed.username) parsed.username = "***";
    return parsed.toString();
  } catch {
    return "redis://redacted";
  }
}

export function isRedisUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "redis:" || protocol === "rediss:";
  } catch {
    return false;
  }
}
