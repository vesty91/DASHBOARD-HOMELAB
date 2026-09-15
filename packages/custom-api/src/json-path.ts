import { IntegrationError } from "@dashboard/integrations";

export const CUSTOM_API_JSON_PATH_MAX_LENGTH = 128;
export const CUSTOM_API_JSON_PATH_MAX_DEPTH = 8;

export type JsonPathSegment =
  | { readonly kind: "key"; readonly name: string }
  | { readonly kind: "index"; readonly index: number };

const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
const KEY_CHAR = /[A-Za-z0-9_-]/u;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function reject(message: string): never {
  throw new IntegrationError("MISCONFIGURED", message);
}

function isForbiddenKey(name: string): boolean {
  return FORBIDDEN_KEYS.has(name.toLocaleLowerCase("und"));
}

export function parseJsonPath(path: string): readonly JsonPathSegment[] {
  if (typeof path !== "string" || path.length === 0) reject("JSON path is required");
  if (path.length > CUSTOM_API_JSON_PATH_MAX_LENGTH) reject("JSON path is too long");
  if (/[\u0000-\u001F\u007F]/u.test(path)) reject("JSON path must not contain control characters");
  if (path.includes("..") || path.includes("*") || path.includes("$") || path.includes("?"))
    reject("JSON path wildcards and filters are not allowed");
  if (/[\s'"`]/u.test(path)) reject("JSON path must not contain quotes or whitespace");
  const segments: JsonPathSegment[] = [];
  let index = 0;
  const readKey = (): string => {
    let end = index;
    while (end < path.length && KEY_CHAR.test(path[end] ?? "")) end += 1;
    const name = path.slice(index, end);
    if (!KEY_PATTERN.test(name)) reject("JSON path segment is invalid");
    if (isForbiddenKey(name)) reject("JSON path must not use prototype keys");
    index = end;
    return name;
  };
  const readIndex = (): number => {
    if (path[index] !== "[") reject("JSON path index is invalid");
    index += 1;
    const start = index;
    while (index < path.length && /[0-9]/u.test(path[index] ?? "")) index += 1;
    const digits = path.slice(start, index);
    if (digits.length === 0 || (digits.length > 1 && digits.startsWith("0")))
      reject("JSON path index is invalid");
    if (path[index] !== "]") reject("JSON path index is invalid");
    index += 1;
    const value = Number(digits);
    if (!Number.isInteger(value) || value < 0 || value > 999) reject("JSON path index is invalid");
    return value;
  };
  if (path[0] === "." || path[0] === "]") reject("JSON path is invalid");
  if (path[0] === "[") {
    segments.push({ kind: "index", index: readIndex() });
  } else {
    segments.push({ kind: "key", name: readKey() });
  }
  while (index < path.length) {
    const current = path[index];
    if (current === ".") {
      index += 1;
      if (index >= path.length) reject("JSON path is invalid");
      segments.push({ kind: "key", name: readKey() });
      continue;
    }
    if (current === "[") {
      segments.push({ kind: "index", index: readIndex() });
      continue;
    }
    reject("JSON path is invalid");
  }
  if (segments.length === 0 || segments.length > CUSTOM_API_JSON_PATH_MAX_DEPTH)
    reject("JSON path depth is invalid");
  return Object.freeze(segments);
}

export function extractJsonPath(payload: unknown, path: string): unknown {
  let segments: readonly JsonPathSegment[];
  try {
    segments = parseJsonPath(path);
  } catch {
    return undefined;
  }
  let current: unknown = payload;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    switch (segment.kind) {
      case "key": {
        if (Array.isArray(current) || isForbiddenKey(segment.name)) return undefined;
        if (!Object.prototype.hasOwnProperty.call(current, segment.name)) return undefined;
        current = (current as Record<string, unknown>)[segment.name];
        break;
      }
      case "index": {
        if (!Array.isArray(current)) return undefined;
        if (segment.index >= current.length) return undefined;
        current = current[segment.index];
        break;
      }
      default: {
        const _exhaustive: never = segment;
        return _exhaustive;
      }
    }
  }
  return current;
}
