import { X509Certificate } from "node:crypto";
import { IntegrationError } from "./errors";

/**
 * A public CA certificate is configuration, not a secret.
 * Private keys are never accepted.
 */

export const MAX_TRUSTED_CA_BYTES = 65_536;
export const MAX_TRUSTED_CA_CERTS = 16;

const CERTIFICATE_PEM_PATTERN = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/gu;
const PRIVATE_KEY_PATTERN = /-----BEGIN (?:(?:RSA|EC|ENCRYPTED) )?PRIVATE KEY-----/u;

export function normalizeOptionalTrustedCaPem(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return normalizeTrustedCaPem(value);
}

export function normalizeTrustedCaPem(value: string): string {
  if (Buffer.byteLength(value, "utf8") > MAX_TRUSTED_CA_BYTES)
    throw new IntegrationError("MISCONFIGURED", "Trusted CA PEM exceeds the size limit");
  if (PRIVATE_KEY_PATTERN.test(value))
    throw new IntegrationError(
      "MISCONFIGURED",
      "Private keys are never accepted as a trusted CA. Provide a public CA certificate only.",
    );
  const blocks = value.match(CERTIFICATE_PEM_PATTERN) ?? [];
  if (blocks.length === 0)
    throw new IntegrationError("MISCONFIGURED", "Trusted CA PEM must contain a CERTIFICATE block");
  if (blocks.length > MAX_TRUSTED_CA_CERTS)
    throw new IntegrationError("MISCONFIGURED", "Trusted CA bundle exceeds the certificate limit");
  let remainder = value;
  for (const block of blocks) remainder = remainder.replace(block, "");
  if (remainder.trim() !== "")
    throw new IntegrationError("MISCONFIGURED", "Trusted CA PEM contains non-certificate material");
  const normalized: string[] = [];
  for (const block of blocks) {
    try {
      new X509Certificate(block);
    } catch {
      throw new IntegrationError(
        "MISCONFIGURED",
        "Trusted CA PEM contains an unparsable certificate",
      );
    }
    normalized.push(block.trim());
  }
  return normalized.join("\n");
}
