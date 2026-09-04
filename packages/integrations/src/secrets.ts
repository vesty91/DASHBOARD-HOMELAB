import { decryptSecret, encryptSecret, SecretError, type SecretKeyring } from "@dashboard/secrets";
import { IntegrationError } from "./errors";
import type {
  EncryptedSecretRow,
  IntegrationDefinition,
  IntegrationStore,
  JsonObject,
} from "./types";

export function collectSecretStringValues(secrets: unknown): string[] {
  const values: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string" && value.length > 0) values.push(value);
    else if (Array.isArray(value)) for (const entry of value) visit(entry);
    else if (value && typeof value === "object")
      for (const entry of Object.values(value as JsonObject)) visit(entry);
  };
  visit(secrets);
  return [...new Set(values)].sort((left, right) => right.length - left.length);
}

export function redactKnownSecretValues(value: unknown, secretValues: readonly string[]): unknown {
  if (secretValues.length === 0) return value;
  if (typeof value === "string") {
    let output = value;
    for (const secret of secretValues)
      if (output.includes(secret)) output = output.split(secret).join("[REDACTED]");
    return output;
  }
  if (Array.isArray(value))
    return value.map((entry) => redactKnownSecretValues(entry, secretValues));
  if (value && typeof value === "object") {
    const output: JsonObject = {};
    for (const [key, entry] of Object.entries(value as JsonObject))
      output[key] = redactKnownSecretValues(entry, secretValues);
    return output;
  }
  return value;
}

function requireKeyring(keyring: SecretKeyring | undefined): SecretKeyring {
  if (!keyring)
    throw new IntegrationError("SECRETS_NOT_CONFIGURED", "SECRET_ENCRYPTION_KEY is not configured");
  return keyring;
}

export async function loadIntegrationSecrets(
  store: IntegrationStore,
  definition: IntegrationDefinition,
  integrationId: string,
  keyring: SecretKeyring | undefined,
): Promise<JsonObject> {
  const required = definition.secretFields.filter((field) => field.required);
  const rows = await store.loadEncryptedSecrets(integrationId);
  if (required.length > 0 && !keyring && rows.length > 0)
    throw new IntegrationError("SECRETS_NOT_CONFIGURED", "SECRET_ENCRYPTION_KEY is not configured");
  if (required.some((field) => !rows.some((row) => row.key === field.key)))
    throw new IntegrationError("MISCONFIGURED", "Required secrets are not configured");
  if (rows.length === 0) {
    const parsed = definition.secretSchema.safeParse({});
    if (!parsed.success)
      throw new IntegrationError("MISCONFIGURED", "Required secrets are not configured");
    return parsed.data as JsonObject;
  }
  const active = requireKeyring(keyring);
  const secrets: JsonObject = {};
  for (const row of rows) {
    try {
      secrets[row.key] = decryptSecret(active, {
        integrationId,
        key: row.key,
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.authTag,
        keyVersion: row.keyVersion,
      });
    } catch (error) {
      if (error instanceof SecretError)
        throw new IntegrationError("MISCONFIGURED", "Unable to decrypt secrets");
      throw error;
    }
  }
  const parsed = definition.secretSchema.safeParse(secrets);
  if (!parsed.success)
    throw new IntegrationError("MISCONFIGURED", "Required secrets are not configured");
  return parsed.data as JsonObject;
}

function encryptServerManagedSecret(
  definition: IntegrationDefinition,
  integrationId: string,
  key: string,
  plaintext: string,
  keyring: SecretKeyring | undefined,
): EncryptedSecretRow {
  const field = definition.secretFields.find((entry) => entry.key === key);
  if (!field?.serverManaged)
    throw new IntegrationError("FORBIDDEN", "This secret is not server-managed");
  const value = field.valueSchema.parse(plaintext);
  const encrypted = encryptSecret(requireKeyring(keyring), {
    integrationId,
    key,
    plaintext: value,
  });
  return { key, ...encrypted };
}

export async function persistServerManagedSecret(
  store: IntegrationStore,
  definition: IntegrationDefinition,
  integrationId: string,
  key: string,
  plaintext: string,
  keyring: SecretKeyring | undefined,
): Promise<EncryptedSecretRow> {
  const row = encryptServerManagedSecret(definition, integrationId, key, plaintext, keyring);
  await store.upsertSecret(integrationId, row);
  return row;
}

export async function persistServerManagedSecretIfRevision(
  store: IntegrationStore,
  definition: IntegrationDefinition,
  integrationId: string,
  key: string,
  plaintext: string,
  expectedRevision: number,
  keyring: SecretKeyring | undefined,
): Promise<boolean> {
  const row = encryptServerManagedSecret(definition, integrationId, key, plaintext, keyring);
  return store.upsertSecretIfRevision(integrationId, expectedRevision, row);
}

export async function clearServerManagedSecret(
  store: IntegrationStore,
  definition: IntegrationDefinition,
  integrationId: string,
  key: string,
): Promise<boolean> {
  const field = definition.secretFields.find((entry) => entry.key === key);
  if (!field?.serverManaged)
    throw new IntegrationError("FORBIDDEN", "This secret is not server-managed");
  return store.deleteSecret(integrationId, key);
}
