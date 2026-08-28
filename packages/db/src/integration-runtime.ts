import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Pool, PoolClient } from "pg";

type IntegrationStatus = "unknown" | "available" | "unavailable";
type JsonObject = Record<string, unknown>;
interface IntegrationRecord {
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
interface EncryptedSecretRow {
  key: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}
interface IntegrationStore {
  list(limit: number, cursor?: string): Promise<IntegrationRecord[]>;
  findById(id: string): Promise<IntegrationRecord | undefined>;
  create(input: {
    type: string;
    name: string;
    baseUrl: string;
    enabled: boolean;
    config: JsonObject;
    createdBy: string | null;
  }): Promise<IntegrationRecord>;
  update(input: {
    id: string;
    name?: string;
    baseUrl?: string;
    enabled?: boolean;
    config?: JsonObject;
    bumpRevision: boolean;
    resetStatus: boolean;
  }): Promise<IntegrationRecord | undefined>;
  delete(id: string): Promise<boolean>;
  listSecretStates(integrationId: string): Promise<readonly { key: string; configured: true }[]>;
  loadEncryptedSecrets(integrationId: string): Promise<readonly EncryptedSecretRow[]>;
  upsertSecret(integrationId: string, secret: EncryptedSecretRow): Promise<void>;
  persistConnectionResult(
    id: string,
    revision: number,
    status: Exclude<IntegrationStatus, "unknown">,
  ): Promise<boolean>;
}

type Row = Record<string, unknown>;

function parseConfig(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonObject;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed as JsonObject;
    } catch {
      return {};
    }
  }
  return {};
}

function dto(row: Row): IntegrationRecord {
  return {
    id: String(row.id),
    type: String(row.type),
    name: String(row.name),
    baseUrl: String(row.base_url),
    enabled: Boolean(row.enabled),
    config: parseConfig(row.config_json),
    status: row.status as IntegrationStatus,
    lastCheckedAt:
      row.last_checked_at == null
        ? null
        : new Date(
            row.last_checked_at instanceof Date ? row.last_checked_at : Number(row.last_checked_at),
          ),
    configRevision: Number(row.config_revision),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: new Date(row.created_at instanceof Date ? row.created_at : Number(row.created_at)),
    updatedAt: new Date(row.updated_at instanceof Date ? row.updated_at : Number(row.updated_at)),
  };
}

function secretRow(row: Row): EncryptedSecretRow {
  return {
    key: String(row.key),
    ciphertext: String(row.ciphertext),
    iv: String(row.iv),
    authTag: String(row.auth_tag),
    keyVersion: Number(row.key_version),
  };
}

export function createSqliteIntegrationStore(db: DatabaseSync): IntegrationStore {
  const find = (id: string) => {
    const row = db.prepare("SELECT * FROM integrations WHERE id=?").get(id);
    return row ? dto(row) : undefined;
  };
  return {
    async list(limit, cursor) {
      return (
        cursor
          ? db
              .prepare("SELECT * FROM integrations WHERE id>? ORDER BY id LIMIT ?")
              .all(cursor, limit)
          : db.prepare("SELECT * FROM integrations ORDER BY id LIMIT ?").all(limit)
      ).map((row) => dto(row));
    },
    async findById(id) {
      return find(id);
    },
    async create(input) {
      const id = randomUUID();
      const now = Date.now();
      db.prepare(
        "INSERT INTO integrations(id,type,name,base_url,enabled,config_json,status,config_revision,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        input.type,
        input.name,
        input.baseUrl,
        input.enabled ? 1 : 0,
        JSON.stringify(input.config),
        "unknown",
        1,
        input.createdBy,
        now,
        now,
      );
      return find(id)!;
    },
    async update(input) {
      const sets: string[] = [];
      const values: Array<string | number | null> = [];
      if (input.name !== undefined) {
        sets.push("name=?");
        values.push(input.name);
      }
      if (input.baseUrl !== undefined) {
        sets.push("base_url=?");
        values.push(input.baseUrl);
      }
      if (input.enabled !== undefined) {
        sets.push("enabled=?");
        values.push(input.enabled ? 1 : 0);
      }
      if (input.config !== undefined) {
        sets.push("config_json=?");
        values.push(JSON.stringify(input.config));
      }
      if (input.resetStatus) {
        sets.push("status=?");
        values.push("unknown");
        sets.push("last_checked_at=?");
        values.push(null);
      }
      sets.push("config_revision=config_revision+?");
      values.push(input.bumpRevision ? 1 : 0);
      sets.push("updated_at=?");
      values.push(Date.now());
      values.push(input.id);
      const result = db
        .prepare(`UPDATE integrations SET ${sets.join(",")} WHERE id=?`)
        .run(...values);
      if (result.changes !== 1) return undefined;
      return find(input.id);
    },
    async delete(id) {
      return db.prepare("DELETE FROM integrations WHERE id=?").run(id).changes === 1;
    },
    async listSecretStates(integrationId) {
      return db
        .prepare("SELECT key FROM integration_secrets WHERE integration_id=? ORDER BY key")
        .all(integrationId)
        .map((row) => ({ key: String(row.key), configured: true as const }));
    },
    async loadEncryptedSecrets(integrationId) {
      return db
        .prepare(
          "SELECT key,ciphertext,iv,auth_tag,key_version FROM integration_secrets WHERE integration_id=?",
        )
        .all(integrationId)
        .map((row) => secretRow(row));
    },
    async upsertSecret(integrationId, secret) {
      const now = Date.now();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          `INSERT INTO integration_secrets(id,integration_id,key,ciphertext,iv,auth_tag,key_version,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?)
           ON CONFLICT(integration_id,key) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,auth_tag=excluded.auth_tag,key_version=excluded.key_version,updated_at=excluded.updated_at`,
        ).run(
          randomUUID(),
          integrationId,
          secret.key,
          secret.ciphertext,
          secret.iv,
          secret.authTag,
          secret.keyVersion,
          now,
          now,
        );
        db.prepare(
          "UPDATE integrations SET config_revision=config_revision+1,status='unknown',last_checked_at=NULL,updated_at=? WHERE id=?",
        ).run(now, integrationId);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async persistConnectionResult(id, revision, status) {
      return (
        db
          .prepare(
            "UPDATE integrations SET status=?,last_checked_at=?,updated_at=? WHERE id=? AND config_revision=?",
          )
          .run(status, Date.now(), Date.now(), id, revision).changes === 1
      );
    },
  };
}

export function createPostgresqlIntegrationStore(pool: Pool): IntegrationStore {
  const find = async (q: Pool | PoolClient, id: string) => {
    const result = await q.query("SELECT * FROM integrations WHERE id=$1", [id]);
    return result.rows[0] ? dto(result.rows[0]) : undefined;
  };
  return {
    async list(limit, cursor) {
      const rows = cursor
        ? await pool.query("SELECT * FROM integrations WHERE id>$1 ORDER BY id LIMIT $2", [
            cursor,
            limit,
          ])
        : await pool.query("SELECT * FROM integrations ORDER BY id LIMIT $1", [limit]);
      return rows.rows.map((row) => dto(row));
    },
    async findById(id) {
      return find(pool, id);
    },
    async create(input) {
      const id = randomUUID();
      await pool.query(
        "INSERT INTO integrations(id,type,name,base_url,enabled,config_json,status,config_revision,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'unknown',1,$7,now(),now())",
        [id, input.type, input.name, input.baseUrl, input.enabled, input.config, input.createdBy],
      );
      return (await find(pool, id))!;
    },
    async update(input) {
      const sets: string[] = [];
      const values: unknown[] = [];
      const param = (value: unknown) => {
        values.push(value);
        return `$${values.length}`;
      };
      if (input.name !== undefined) sets.push(`name=${param(input.name)}`);
      if (input.baseUrl !== undefined) sets.push(`base_url=${param(input.baseUrl)}`);
      if (input.enabled !== undefined) sets.push(`enabled=${param(input.enabled)}`);
      if (input.config !== undefined) sets.push(`config_json=${param(input.config)}`);
      if (input.resetStatus) {
        sets.push(`status=${param("unknown")}`);
        sets.push("last_checked_at=NULL");
      }
      sets.push(
        `config_revision=config_revision+CASE WHEN ${param(input.bumpRevision)}::boolean THEN 1 ELSE 0 END`,
      );
      sets.push("updated_at=now()");
      const result = await pool.query(
        `UPDATE integrations SET ${sets.join(",")} WHERE id=${param(input.id)}`,
        values,
      );
      if (result.rowCount !== 1) return undefined;
      return find(pool, input.id);
    },
    async delete(id) {
      return (await pool.query("DELETE FROM integrations WHERE id=$1", [id])).rowCount === 1;
    },
    async listSecretStates(integrationId) {
      const result = await pool.query(
        "SELECT key FROM integration_secrets WHERE integration_id=$1 ORDER BY key",
        [integrationId],
      );
      return result.rows.map((row) => ({ key: String(row.key), configured: true as const }));
    },
    async loadEncryptedSecrets(integrationId) {
      const result = await pool.query(
        "SELECT key,ciphertext,iv,auth_tag,key_version FROM integration_secrets WHERE integration_id=$1",
        [integrationId],
      );
      return result.rows.map((row) => secretRow(row));
    },
    async upsertSecret(integrationId, secret) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO integration_secrets(id,integration_id,key,ciphertext,iv,auth_tag,key_version,created_at,updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,now(),now())
           ON CONFLICT (integration_id, key) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag,key_version=EXCLUDED.key_version,updated_at=now()`,
          [
            randomUUID(),
            integrationId,
            secret.key,
            secret.ciphertext,
            secret.iv,
            secret.authTag,
            secret.keyVersion,
          ],
        );
        await client.query(
          "UPDATE integrations SET config_revision=config_revision+1,status='unknown',last_checked_at=NULL,updated_at=now() WHERE id=$1",
          [integrationId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async persistConnectionResult(id, revision, status) {
      return (
        (
          await pool.query(
            "UPDATE integrations SET status=$1,last_checked_at=now(),updated_at=now() WHERE id=$2 AND config_revision=$3",
            [status, id, revision],
          )
        ).rowCount === 1
      );
    },
  };
}
