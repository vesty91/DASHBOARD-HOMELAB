import type { z } from "zod";
import type { EncryptedSecret } from "@dashboard/secrets";
import type { PermissionSubject } from "@dashboard/permissions";
import type { IntegrationErrorCode } from "./errors";
import type { SecureHttpRequest, SecureHttpResult } from "./http-client";

export type IntegrationCapability = string;
export type IntegrationStatus = "unknown" | "available" | "unavailable";
export type JsonObject = Record<string, unknown>;

export interface ConfigFieldMeta {
  readonly key: string;
  readonly label: string;
  readonly required: boolean;
}

export interface SecretFieldMeta<TValue = string> {
  readonly key: string;
  readonly label: string;
  readonly required: boolean;
  readonly valueSchema: z.ZodType<TValue>;
  readonly serverManaged?: boolean;
}

export type ConnectionResult =
  | { ok: true; latencyMs: number; metadata?: JsonObject }
  | { ok: false; code: IntegrationErrorCode; message?: string };

export interface IntegrationClient {
  testConnection(): Promise<ConnectionResult>;
}

export interface IntegrationClientContext<TConfig, TSecrets> {
  integrationId: string;
  baseUrl: string;
  config: TConfig;
  secrets: TSecrets;
  verifyTls: boolean;
  timeoutMs: number;
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>;
}

export interface IntegrationDefinition<TConfig = JsonObject, TSecrets = JsonObject> {
  readonly id: string;
  readonly displayName: string;
  readonly version: number;
  readonly description: string;
  readonly configSchema: z.ZodType<TConfig>;
  readonly secretSchema: z.ZodType<TSecrets>;
  readonly capabilities: readonly IntegrationCapability[];
  readonly allowedSchemes: readonly string[];
  readonly configFields: readonly ConfigFieldMeta[];
  readonly secretFields: readonly SecretFieldMeta[];
  createClient(ctx: IntegrationClientContext<TConfig, TSecrets>): IntegrationClient;
  testConnection(ctx: IntegrationClientContext<TConfig, TSecrets>): Promise<ConnectionResult>;
}

export interface IntegrationRecord {
  id: string;
  type: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  config: JsonObject;
  status: IntegrationStatus;
  lastCheckedAt: Date | null;
  configRevision: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationSecretState {
  key: string;
  configured: true;
}

export interface IntegrationDto {
  id: string;
  type: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  config: JsonObject;
  status: IntegrationStatus;
  lastCheckedAt: Date | null;
  configRevision: number;
  createdAt: Date;
  updatedAt: Date;
  definitionAvailable: boolean;
  capabilities: readonly string[];
  secrets: Record<string, { configured: boolean }>;
}

export interface IntegrationCatalogEntry {
  id: string;
  displayName: string;
  version: number;
  description: string;
  capabilities: readonly string[];
  configFields: readonly ConfigFieldMeta[];
  secretFields: readonly {
    key: string;
    label: string;
    required: boolean;
    serverManaged?: boolean;
  }[];
}

export interface IntegrationCreateInput {
  type: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  config: JsonObject;
}

export interface IntegrationUpdateInput {
  id: string;
  name?: string;
  baseUrl?: string;
  enabled?: boolean;
  config?: JsonObject;
}

export interface EncryptedSecretRow extends EncryptedSecret {
  key: string;
}

export interface IntegrationStore {
  list(limit: number, cursor?: string): Promise<IntegrationRecord[]>;
  findById(id: string): Promise<IntegrationRecord | undefined>;
  create(input: IntegrationCreateInput & { createdBy: string | null }): Promise<IntegrationRecord>;
  update(
    input: IntegrationUpdateInput & { bumpRevision: boolean; resetStatus: boolean },
  ): Promise<IntegrationRecord | undefined>;
  delete(id: string): Promise<boolean>;
  listSecretStates(integrationId: string): Promise<readonly IntegrationSecretState[]>;
  loadEncryptedSecrets(integrationId: string): Promise<readonly EncryptedSecretRow[]>;
  upsertSecret(integrationId: string, secret: EncryptedSecretRow): Promise<void>;
  upsertSecretIfRevision(
    integrationId: string,
    expectedRevision: number,
    secret: EncryptedSecretRow,
  ): Promise<boolean>;
  deleteSecret(integrationId: string, key: string): Promise<boolean>;
  persistConnectionResult(
    id: string,
    revision: number,
    status: Exclude<IntegrationStatus, "unknown">,
  ): Promise<boolean>;
}

export interface IntegrationActor {
  userId: string | null;
  subject: PermissionSubject | null;
}

export interface IntegrationCache {
  get(integrationId: string, operation: string): unknown;
  set(integrationId: string, operation: string, value: unknown, ttlMs?: number): void;
  invalidate(integrationId: string): void;
  clear(): void;
}

export interface IntegrationRateLimiter {
  tryConsume(actorId: string, integrationId: string): boolean;
}
