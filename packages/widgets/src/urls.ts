const blocked = new Set(["javascript:", "data:", "file:", "blob:", "ftp:"]);

export function parseHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (blocked.has(url.protocol) || !["http:", "https:"].includes(url.protocol)) return null;
    if (!url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
