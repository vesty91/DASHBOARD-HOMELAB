import { normalizeCapabilities } from "./capabilities";
import { IntegrationError } from "./errors";
import type { IntegrationDefinition } from "./types";

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DEFAULT_SCHEMES = Object.freeze(["http:", "https:"]);

export function assertIntegrationDefinition(definition: IntegrationDefinition): void {
  if (!idPattern.test(definition.id))
    throw new IntegrationError("MISCONFIGURED", "Integration id must be a stable lowercase slug");
  if (!Number.isInteger(definition.version) || definition.version < 1)
    throw new IntegrationError("MISCONFIGURED", "Integration version must be an integer >= 1");
  if (!definition.displayName.trim())
    throw new IntegrationError("MISCONFIGURED", "Integration displayName is required");
  if (!definition.description.trim())
    throw new IntegrationError("MISCONFIGURED", "Integration description is required");
  normalizeCapabilities(definition.capabilities);
  const secretKeys = new Set(definition.secretFields.map((field) => field.key));
  if (secretKeys.size !== definition.secretFields.length)
    throw new IntegrationError("MISCONFIGURED", "Secret field keys must be unique");
  const configKeys = new Set(definition.configFields.map((field) => field.key));
  if (configKeys.size !== definition.configFields.length)
    throw new IntegrationError("MISCONFIGURED", "Config field keys must be unique");
  for (const key of secretKeys)
    if (configKeys.has(key))
      throw new IntegrationError("MISCONFIGURED", "Config and secret field keys must not overlap");
  const schemes = definition.allowedSchemes.length ? definition.allowedSchemes : DEFAULT_SCHEMES;
  for (const scheme of schemes)
    if (!scheme.endsWith(":"))
      throw new IntegrationError("MISCONFIGURED", "allowedSchemes must include a trailing colon");
}

export function sealIntegrationDefinition<TConfig, TSecrets>(
  definition: IntegrationDefinition<TConfig, TSecrets>,
): IntegrationDefinition<TConfig, TSecrets> {
  assertIntegrationDefinition(definition as IntegrationDefinition);
  const sealed: IntegrationDefinition<TConfig, TSecrets> = {
    id: definition.id,
    displayName: definition.displayName,
    version: definition.version,
    description: definition.description,
    configSchema: definition.configSchema,
    secretSchema: definition.secretSchema,
    capabilities: Object.freeze([...definition.capabilities]),
    allowedSchemes: Object.freeze(
      definition.allowedSchemes.length ? [...definition.allowedSchemes] : [...DEFAULT_SCHEMES],
    ),
    configFields: Object.freeze(
      definition.configFields.map((field) => Object.freeze({ ...field })),
    ),
    secretFields: Object.freeze(
      definition.secretFields.map((field) =>
        Object.freeze({
          key: field.key,
          label: field.label,
          required: field.required,
          valueSchema: field.valueSchema,
        }),
      ),
    ),
    createClient: definition.createClient,
    testConnection: definition.testConnection,
  };
  return Object.freeze(sealed);
}

export function assertConfigExcludesSecretKeys(
  definition: IntegrationDefinition,
  config: Record<string, unknown>,
): void {
  const secretKeys = new Set(definition.secretFields.map((field) => field.key));
  for (const key of Object.keys(config))
    if (secretKeys.has(key))
      throw new IntegrationError("VALIDATION_ERROR", "Secret fields cannot be stored in config");
}

export function catalogEntryFromDefinition(definition: IntegrationDefinition) {
  return Object.freeze({
    id: definition.id,
    displayName: definition.displayName,
    version: definition.version,
    description: definition.description,
    capabilities: definition.capabilities,
    configFields: definition.configFields.map((field) =>
      Object.freeze({ key: field.key, label: field.label, required: field.required }),
    ),
    secretFields: definition.secretFields.map((field) =>
      Object.freeze({ key: field.key, label: field.label, required: field.required }),
    ),
  });
}
