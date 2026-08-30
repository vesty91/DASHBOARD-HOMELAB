import { IntegrationError } from "@dashboard/integrations";

export const CLIENT_MIN_API = "1.40";
export const CLIENT_MAX_API = "1.55";

export interface DockerApiVersion {
  readonly major: number;
  readonly minor: number;
}

const VERSION_PATTERN = /^(\d+)\.(\d+)$/u;

export function parseDockerApiVersion(value: string): DockerApiVersion {
  const match = VERSION_PATTERN.exec(value.trim());
  if (!match) throw new IntegrationError("UNSUPPORTED_VERSION", "Invalid Docker API version");
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isInteger(major) || !Number.isInteger(minor) || major < 1)
    throw new IntegrationError("UNSUPPORTED_VERSION", "Invalid Docker API version");
  return { major, minor };
}

export function formatDockerApiVersion(version: DockerApiVersion): string {
  return `${version.major}.${version.minor}`;
}

export function compareDockerApiVersions(left: DockerApiVersion, right: DockerApiVersion): number {
  if (left.major !== right.major) return left.major < right.major ? -1 : 1;
  if (left.minor !== right.minor) return left.minor < right.minor ? -1 : 1;
  return 0;
}

export function minDockerApiVersion(
  left: DockerApiVersion,
  right: DockerApiVersion,
): DockerApiVersion {
  return compareDockerApiVersions(left, right) <= 0 ? left : right;
}

export function maxDockerApiVersion(
  left: DockerApiVersion,
  right: DockerApiVersion,
): DockerApiVersion {
  return compareDockerApiVersions(left, right) >= 0 ? left : right;
}

export function negotiateDockerApiVersion(input: {
  readonly serverApiVersion: string;
  readonly serverMinApiVersion?: string | undefined;
}): string {
  const clientMin = parseDockerApiVersion(CLIENT_MIN_API);
  const clientMax = parseDockerApiVersion(CLIENT_MAX_API);
  const serverMax = parseDockerApiVersion(input.serverApiVersion);
  const serverMin = input.serverMinApiVersion
    ? parseDockerApiVersion(input.serverMinApiVersion)
    : clientMin;
  const chosen = minDockerApiVersion(clientMax, serverMax);
  if (compareDockerApiVersions(chosen, clientMin) < 0)
    throw new IntegrationError(
      "UNSUPPORTED_VERSION",
      "Docker Engine API is below the client minimum",
    );
  if (compareDockerApiVersions(chosen, serverMin) < 0)
    throw new IntegrationError(
      "UNSUPPORTED_VERSION",
      "No overlapping Docker Engine API version with this client",
    );
  return formatDockerApiVersion(chosen);
}

export function isSupportedDockerApiVersion(value: string): boolean {
  try {
    const parsed = parseDockerApiVersion(value);
    return (
      compareDockerApiVersions(parsed, parseDockerApiVersion(CLIENT_MIN_API)) >= 0 &&
      compareDockerApiVersions(parsed, parseDockerApiVersion(CLIENT_MAX_API)) <= 0
    );
  } catch {
    return false;
  }
}
