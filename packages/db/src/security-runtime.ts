import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Pool } from "pg";
import {
  AUDIT_ACTIONS,
  boundUserAgent,
  hashSessionId,
  isAuditAction,
  sanitizeAuditMetadata,
  type AuditAction,
  type AuditEvent,
  type AuditEventInput,
  type AuditOutcome,
} from "@dashboard/auth/audit";
import type { AuthSessionRecord } from "@dashboard/auth/sessions";

export const OIDC_SECRET_ID = "client_secret";

export interface OidcSettingsRow {
  enabled: boolean;
  issuer: string | null;
  clientId: string | null;
  displayName: string | null;
  scopes: string;
  redirectUri: string | null;
  groupClaim: string;
  autoLinkVerifiedEmail: boolean;
  autoProvision: boolean;
  allowLocalLogin: boolean;
}

export interface EncryptedOidcSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export interface OidcIdentityRow {
  id: string;
  userId: string;
  issuer: string;
  subject: string;
  email: string | null;
}

export interface OidcGroupMappingRow {
  id: string;
  oidcGroup: string;
  localGroupId: string;
}

export interface AuditListQuery {
  limit: number;
  cursor?: string;
  action?: AuditAction;
  actorUserId?: string;
  from?: Date;
  to?: Date;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") return new Date(value);
  throw new TypeError("Invalid date");
}

function asNullableDate(value: unknown): Date | null {
  return value == null ? null : asDate(value);
}

function mapSession(row: Record<string, unknown>): AuthSessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    createdAt: asDate(row.created_at),
    lastSeenAt: asDate(row.last_seen_at),
    expiresAt: asDate(row.expires_at),
    revokedAt: asNullableDate(row.revoked_at),
    userAgent: row.user_agent == null ? null : String(row.user_agent),
    ip: row.ip == null ? null : String(row.ip),
  };
}

function mapAudit(row: Record<string, unknown>): AuditEvent {
  const action = String(row.action);
  const outcome = String(row.outcome);
  let metadata: Record<string, unknown> = {};
  if (typeof row.metadata_json === "string") {
    try {
      metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
    } catch {
      metadata = {};
    }
  } else if (row.metadata_json && typeof row.metadata_json === "object") {
    metadata = row.metadata_json as Record<string, unknown>;
  }
  return {
    id: String(row.id),
    actorUserId: row.actor_user_id == null ? null : String(row.actor_user_id),
    action: isAuditAction(action) ? action : AUDIT_ACTIONS[0],
    targetType: String(row.target_type),
    targetId: row.target_id == null ? null : String(row.target_id),
    outcome: (["success", "failure", "denied"] as const).includes(outcome as AuditOutcome)
      ? (outcome as AuditOutcome)
      : "failure",
    metadata,
    ip: row.ip == null ? null : String(row.ip),
    userAgent: row.user_agent == null ? null : String(row.user_agent),
    sessionIdHash: row.session_id_hash == null ? null : String(row.session_id_hash),
    createdAt: asDate(row.created_at).toISOString(),
  };
}

function mapSettings(row: Record<string, unknown> | undefined): OidcSettingsRow {
  if (!row) {
    return {
      enabled: false,
      issuer: null,
      clientId: null,
      displayName: null,
      scopes: "openid profile email groups",
      redirectUri: null,
      groupClaim: "groups",
      autoLinkVerifiedEmail: false,
      autoProvision: false,
      allowLocalLogin: true,
    };
  }
  return {
    enabled: asBoolean(row.oidc_enabled),
    issuer: row.oidc_issuer == null ? null : String(row.oidc_issuer),
    clientId: row.oidc_client_id == null ? null : String(row.oidc_client_id),
    displayName: row.oidc_display_name == null ? null : String(row.oidc_display_name),
    scopes: row.oidc_scopes == null ? "openid profile email groups" : String(row.oidc_scopes),
    redirectUri: row.oidc_redirect_uri == null ? null : String(row.oidc_redirect_uri),
    groupClaim: row.oidc_group_claim == null ? "groups" : String(row.oidc_group_claim),
    autoLinkVerifiedEmail: asBoolean(row.oidc_auto_link_verified_email),
    autoProvision: asBoolean(row.oidc_auto_provision),
    allowLocalLogin:
      row.oidc_allow_local_login == null ? true : asBoolean(row.oidc_allow_local_login),
  };
}

export function createSqliteSecurityStore(database: DatabaseSync) {
  return {
    async getOidcSettings() {
      const row = database.prepare("SELECT * FROM server_settings WHERE id='global'").get() as
        Record<string, unknown> | undefined;
      return mapSettings(row);
    },
    async saveOidcSettings(settings: OidcSettingsRow) {
      database
        .prepare(
          `UPDATE server_settings SET
            oidc_enabled=?, oidc_issuer=?, oidc_client_id=?, oidc_display_name=?, oidc_scopes=?,
            oidc_redirect_uri=?, oidc_group_claim=?, oidc_auto_link_verified_email=?,
            oidc_auto_provision=?, oidc_allow_local_login=?, updated_at=?
          WHERE id='global'`,
        )
        .run(
          settings.enabled ? 1 : 0,
          settings.issuer,
          settings.clientId,
          settings.displayName,
          settings.scopes,
          settings.redirectUri,
          settings.groupClaim,
          settings.autoLinkVerifiedEmail ? 1 : 0,
          settings.autoProvision ? 1 : 0,
          settings.allowLocalLogin ? 1 : 0,
          Date.now(),
        );
    },
    async getOidcSecret(): Promise<EncryptedOidcSecret | undefined> {
      const row = database
        .prepare("SELECT ciphertext,iv,auth_tag,key_version FROM oidc_secrets WHERE id=?")
        .get(OIDC_SECRET_ID) as Record<string, unknown> | undefined;
      if (!row) return undefined;
      return {
        ciphertext: String(row.ciphertext),
        iv: String(row.iv),
        authTag: String(row.auth_tag),
        keyVersion: Number(row.key_version),
      };
    },
    async setOidcSecret(secret: EncryptedOidcSecret) {
      const now = Date.now();
      database
        .prepare(
          `INSERT INTO oidc_secrets(id,ciphertext,iv,auth_tag,key_version,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET ciphertext=excluded.ciphertext, iv=excluded.iv,
             auth_tag=excluded.auth_tag, key_version=excluded.key_version, updated_at=excluded.updated_at`,
        )
        .run(
          OIDC_SECRET_ID,
          secret.ciphertext,
          secret.iv,
          secret.authTag,
          secret.keyVersion,
          now,
          now,
        );
    },
    async findOidcIdentity(issuer: string, subject: string): Promise<OidcIdentityRow | undefined> {
      const row = database
        .prepare(
          "SELECT id,user_id,issuer,subject,email FROM oidc_identities WHERE issuer=? AND subject=?",
        )
        .get(issuer, subject) as Record<string, unknown> | undefined;
      if (!row) return undefined;
      return {
        id: String(row.id),
        userId: String(row.user_id),
        issuer: String(row.issuer),
        subject: String(row.subject),
        email: row.email == null ? null : String(row.email),
      };
    },
    async linkOidcIdentity(input: {
      userId: string;
      issuer: string;
      subject: string;
      email: string | null;
    }) {
      const now = Date.now();
      database
        .prepare(
          "INSERT INTO oidc_identities(id,user_id,issuer,subject,email,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(randomUUID(), input.userId, input.issuer, input.subject, input.email, now, now);
    },
    async listOidcMappings(): Promise<OidcGroupMappingRow[]> {
      return database
        .prepare(
          "SELECT id,oidc_group,local_group_id,created_at FROM oidc_group_mappings ORDER BY oidc_group",
        )
        .all()
        .map((row) => ({
          id: String(row.id),
          oidcGroup: String(row.oidc_group),
          localGroupId: String(row.local_group_id),
        }));
    },
    async replaceOidcMappings(mappings: readonly { oidcGroup: string; localGroupId: string }[]) {
      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare("DELETE FROM oidc_group_mappings").run();
        const insert = database.prepare(
          "INSERT INTO oidc_group_mappings(id,oidc_group,local_group_id,created_at) VALUES(?,?,?,?)",
        );
        const now = Date.now();
        for (const mapping of mappings)
          insert.run(randomUUID(), mapping.oidcGroup, mapping.localGroupId, now);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    async createSession(input: {
      id: string;
      userId: string;
      expiresAt: Date;
      userAgent: string | null;
      ip: string | null;
    }) {
      const now = Date.now();
      database
        .prepare(
          "INSERT INTO auth_sessions(id,user_id,created_at,last_seen_at,expires_at,user_agent,ip) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          input.id,
          input.userId,
          now,
          now,
          input.expiresAt.getTime(),
          boundUserAgent(input.userAgent),
          input.ip,
        );
    },
    async findSession(id: string): Promise<AuthSessionRecord | undefined> {
      const row = database.prepare("SELECT * FROM auth_sessions WHERE id=?").get(id) as
        Record<string, unknown> | undefined;
      return row ? mapSession(row) : undefined;
    },
    async touchSession(id: string) {
      database
        .prepare("UPDATE auth_sessions SET last_seen_at=? WHERE id=? AND revoked_at IS NULL")
        .run(Date.now(), id);
    },
    async listSessions(userId: string): Promise<AuthSessionRecord[]> {
      return database
        .prepare(
          "SELECT * FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY last_seen_at DESC",
        )
        .all(userId, Date.now())
        .map((row) => mapSession(row as Record<string, unknown>));
    },
    async revokeSession(id: string, userId: string) {
      database
        .prepare(
          "UPDATE auth_sessions SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL",
        )
        .run(Date.now(), id, userId);
    },
    async revokeOtherSessions(userId: string, keepId: string) {
      database
        .prepare(
          "UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND id<>? AND revoked_at IS NULL",
        )
        .run(Date.now(), userId, keepId);
    },
    async revokeAllSessions(userId: string) {
      database
        .prepare("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL")
        .run(Date.now(), userId);
    },
    async recordAudit(event: AuditEventInput) {
      const metadata = sanitizeAuditMetadata(event.metadata);
      database
        .prepare(
          `INSERT INTO audit_logs(id,actor_user_id,action,target_type,target_id,outcome,metadata_json,ip,user_agent,session_id_hash,created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          event.actorUserId ?? null,
          event.action,
          event.targetType,
          event.targetId ?? null,
          event.outcome,
          JSON.stringify(metadata),
          event.ip ?? null,
          boundUserAgent(event.userAgent),
          event.sessionId ? hashSessionId(event.sessionId) : null,
          Date.now(),
        );
    },
    async listAudit(
      query: AuditListQuery,
    ): Promise<{ items: AuditEvent[]; nextCursor: string | null }> {
      const clauses = ["1=1"];
      const params: Array<string | number> = [];
      if (query.action) {
        clauses.push("action=?");
        params.push(query.action);
      }
      if (query.actorUserId) {
        clauses.push("actor_user_id=?");
        params.push(query.actorUserId);
      }
      if (query.from) {
        clauses.push("created_at>=?");
        params.push(query.from.getTime());
      }
      if (query.to) {
        clauses.push("created_at<=?");
        params.push(query.to.getTime());
      }
      if (query.cursor) {
        clauses.push("(created_at,id) < (?,?)");
        const [createdAt, id] = query.cursor.split("|");
        params.push(Number(createdAt), id ?? "");
      }
      params.push(query.limit + 1);
      const rows = database
        .prepare(
          `SELECT * FROM audit_logs WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .all(...params)
        .map((row) => mapAudit(row as Record<string, unknown>));
      const hasMore = rows.length > query.limit;
      const items = hasMore ? rows.slice(0, query.limit) : rows;
      const last = items.at(-1);
      return {
        items,
        nextCursor: hasMore && last ? `${new Date(last.createdAt).getTime()}|${last.id}` : null,
      };
    },
  };
}

export function createPostgresqlSecurityStore(pool: Pool) {
  return {
    async getOidcSettings() {
      const result = await pool.query("SELECT * FROM server_settings WHERE id='global'");
      return mapSettings(result.rows[0] as Record<string, unknown> | undefined);
    },
    async saveOidcSettings(settings: OidcSettingsRow) {
      await pool.query(
        `UPDATE server_settings SET
          oidc_enabled=$1, oidc_issuer=$2, oidc_client_id=$3, oidc_display_name=$4, oidc_scopes=$5,
          oidc_redirect_uri=$6, oidc_group_claim=$7, oidc_auto_link_verified_email=$8,
          oidc_auto_provision=$9, oidc_allow_local_login=$10, updated_at=now()
        WHERE id='global'`,
        [
          settings.enabled,
          settings.issuer,
          settings.clientId,
          settings.displayName,
          settings.scopes,
          settings.redirectUri,
          settings.groupClaim,
          settings.autoLinkVerifiedEmail,
          settings.autoProvision,
          settings.allowLocalLogin,
        ],
      );
    },
    async getOidcSecret(): Promise<EncryptedOidcSecret | undefined> {
      const result = await pool.query(
        "SELECT ciphertext,iv,auth_tag,key_version FROM oidc_secrets WHERE id=$1",
        [OIDC_SECRET_ID],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) return undefined;
      return {
        ciphertext: String(row.ciphertext),
        iv: String(row.iv),
        authTag: String(row.auth_tag),
        keyVersion: Number(row.key_version),
      };
    },
    async setOidcSecret(secret: EncryptedOidcSecret) {
      await pool.query(
        `INSERT INTO oidc_secrets(id,ciphertext,iv,auth_tag,key_version,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,now(),now())
         ON CONFLICT(id) DO UPDATE SET ciphertext=excluded.ciphertext, iv=excluded.iv,
           auth_tag=excluded.auth_tag, key_version=excluded.key_version, updated_at=now()`,
        [OIDC_SECRET_ID, secret.ciphertext, secret.iv, secret.authTag, secret.keyVersion],
      );
    },
    async findOidcIdentity(issuer: string, subject: string): Promise<OidcIdentityRow | undefined> {
      const result = await pool.query(
        "SELECT id,user_id,issuer,subject,email FROM oidc_identities WHERE issuer=$1 AND subject=$2",
        [issuer, subject],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) return undefined;
      return {
        id: String(row.id),
        userId: String(row.user_id),
        issuer: String(row.issuer),
        subject: String(row.subject),
        email: row.email == null ? null : String(row.email),
      };
    },
    async linkOidcIdentity(input: {
      userId: string;
      issuer: string;
      subject: string;
      email: string | null;
    }) {
      await pool.query(
        "INSERT INTO oidc_identities(id,user_id,issuer,subject,email,created_at,updated_at) VALUES($1,$2,$3,$4,$5,now(),now())",
        [randomUUID(), input.userId, input.issuer, input.subject, input.email],
      );
    },
    async listOidcMappings(): Promise<OidcGroupMappingRow[]> {
      const result = await pool.query(
        "SELECT id,oidc_group,local_group_id FROM oidc_group_mappings ORDER BY oidc_group",
      );
      return result.rows.map((row) => ({
        id: String(row.id),
        oidcGroup: String(row.oidc_group),
        localGroupId: String(row.local_group_id),
      }));
    },
    async replaceOidcMappings(mappings: readonly { oidcGroup: string; localGroupId: string }[]) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM oidc_group_mappings");
        for (const mapping of mappings)
          await client.query(
            "INSERT INTO oidc_group_mappings(id,oidc_group,local_group_id,created_at) VALUES($1,$2,$3,now())",
            [randomUUID(), mapping.oidcGroup, mapping.localGroupId],
          );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async createSession(input: {
      id: string;
      userId: string;
      expiresAt: Date;
      userAgent: string | null;
      ip: string | null;
    }) {
      await pool.query(
        "INSERT INTO auth_sessions(id,user_id,created_at,last_seen_at,expires_at,user_agent,ip) VALUES($1,$2,now(),now(),$3,$4,$5)",
        [input.id, input.userId, input.expiresAt, boundUserAgent(input.userAgent), input.ip],
      );
    },
    async findSession(id: string): Promise<AuthSessionRecord | undefined> {
      const result = await pool.query("SELECT * FROM auth_sessions WHERE id=$1", [id]);
      return result.rows[0] ? mapSession(result.rows[0] as Record<string, unknown>) : undefined;
    },
    async touchSession(id: string) {
      await pool.query(
        "UPDATE auth_sessions SET last_seen_at=now() WHERE id=$1 AND revoked_at IS NULL",
        [id],
      );
    },
    async listSessions(userId: string): Promise<AuthSessionRecord[]> {
      const result = await pool.query(
        "SELECT * FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY last_seen_at DESC",
        [userId],
      );
      return result.rows.map((row) => mapSession(row as Record<string, unknown>));
    },
    async revokeSession(id: string, userId: string) {
      await pool.query(
        "UPDATE auth_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL",
        [id, userId],
      );
    },
    async revokeOtherSessions(userId: string, keepId: string) {
      await pool.query(
        "UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL",
        [userId, keepId],
      );
    },
    async revokeAllSessions(userId: string) {
      await pool.query(
        "UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
        [userId],
      );
    },
    async recordAudit(event: AuditEventInput) {
      const metadata = sanitizeAuditMetadata(event.metadata);
      await pool.query(
        `INSERT INTO audit_logs(id,actor_user_id,action,target_type,target_id,outcome,metadata_json,ip,user_agent,session_id_hash,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,now())`,
        [
          randomUUID(),
          event.actorUserId ?? null,
          event.action,
          event.targetType,
          event.targetId ?? null,
          event.outcome,
          JSON.stringify(metadata),
          event.ip ?? null,
          boundUserAgent(event.userAgent),
          event.sessionId ? hashSessionId(event.sessionId) : null,
        ],
      );
    },
    async listAudit(
      query: AuditListQuery,
    ): Promise<{ items: AuditEvent[]; nextCursor: string | null }> {
      const clauses = ["1=1"];
      const params: unknown[] = [];
      let index = 1;
      if (query.action) {
        clauses.push(`action=$${index++}`);
        params.push(query.action);
      }
      if (query.actorUserId) {
        clauses.push(`actor_user_id=$${index++}`);
        params.push(query.actorUserId);
      }
      if (query.from) {
        clauses.push(`created_at>=$${index++}`);
        params.push(query.from);
      }
      if (query.to) {
        clauses.push(`created_at<=$${index++}`);
        params.push(query.to);
      }
      if (query.cursor) {
        const [createdAt, id] = query.cursor.split("|");
        clauses.push(`(created_at,id) < ($${index++},$${index++})`);
        params.push(new Date(Number(createdAt)), id ?? "");
      }
      params.push(query.limit + 1);
      const result = await pool.query(
        `SELECT * FROM audit_logs WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT $${index}`,
        params,
      );
      const rows = result.rows.map((row) => mapAudit(row as Record<string, unknown>));
      const hasMore = rows.length > query.limit;
      const items = hasMore ? rows.slice(0, query.limit) : rows;
      const last = items.at(-1);
      return {
        items,
        nextCursor: hasMore && last ? `${new Date(last.createdAt).getTime()}|${last.id}` : null,
      };
    },
  };
}

export type SecurityStore = ReturnType<typeof createSqliteSecurityStore>;
