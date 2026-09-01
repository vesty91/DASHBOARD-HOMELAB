import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Pool } from "pg";
import { isPermission } from "@dashboard/permissions";

export interface AuthUserRow {
  id: string;
  username: string;
  displayName: string | null;
  status: "active" | "disabled";
  isSystemAdmin: boolean;
  authVersion: number;
}
export interface FirstAdminInput {
  username: string;
  usernameCanonical: string;
  displayName?: string | null;
  passwordHash: string;
}
export interface GroupWithRoleInput {
  name: string;
  description?: string | null;
  roleName: string;
  userId?: string | null;
}
export class AuthRepositoryError extends Error {
  constructor(
    readonly code:
      | "ONBOARDING_ALREADY_COMPLETED"
      | "LAST_SYSTEM_ADMIN"
      | "ROLE_NOT_FOUND"
      | "GROUP_NOT_FOUND"
      | "INVALID_PERMISSION",
  ) {
    super(code);
  }
}
export const GROUP_GRANTS_ROLE_PREFIX = "GROUP_GRANTS_";
export function groupGrantsRoleName(groupId: string): string {
  return `${GROUP_GRANTS_ROLE_PREFIX}${groupId}`;
}
function uniqueGrantPermissions(permissions: readonly string[]): string[] {
  const unique = [...new Set(permissions)];
  for (const permission of unique)
    if (!isPermission(permission)) throw new AuthRepositoryError("INVALID_PERMISSION");
  return unique;
}
const mapSqliteUser = (row: Record<string, unknown>): AuthUserRow => ({
  id: String(row.id),
  username: String(row.username),
  displayName: row.display_name === null ? null : String(row.display_name),
  status: row.status === "disabled" ? "disabled" : "active",
  isSystemAdmin: Boolean(row.is_system_admin),
  authVersion: Number(row.auth_version),
});
const mapPostgresUser = (row: Record<string, unknown>): AuthUserRow => ({
  id: String(row.id),
  username: String(row.username),
  displayName: row.display_name === null ? null : String(row.display_name),
  status: row.status === "disabled" ? "disabled" : "active",
  isSystemAdmin: Boolean(row.is_system_admin),
  authVersion: Number(row.auth_version),
});

export function createSqliteAuthStore(database: DatabaseSync) {
  const findUser = (id: string) => {
    const row = database
      .prepare(
        "SELECT id, username, display_name, status, is_system_admin, auth_version FROM users WHERE id = ?",
      )
      .get(id);
    return row ? mapSqliteUser(row) : undefined;
  };
  return {
    async listUsers() {
      return database
        .prepare(
          "SELECT id,username,display_name,status,is_system_admin,auth_version FROM users ORDER BY username_canonical",
        )
        .all()
        .map(mapSqliteUser);
    },
    async createLocalUser(input: FirstAdminInput & { email?: string | null; roleName: string }) {
      const id = randomUUID(),
        now = Date.now();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            "INSERT INTO users(id,username,username_canonical,email,display_name,status,is_system_admin,auth_version,created_at,updated_at) VALUES(?,?,?,?,?,'active',0,1,?,?)",
          )
          .run(
            id,
            input.username,
            input.usernameCanonical,
            input.email ?? null,
            input.displayName ?? null,
            now,
            now,
          );
        database
          .prepare(
            "INSERT INTO user_credentials(user_id,password_hash,password_updated_at,created_at,updated_at) VALUES(?,?,?,?,?)",
          )
          .run(id, input.passwordHash, now, now, now);
        database
          .prepare("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE name=?")
          .run(id, input.roleName);
        database.exec("COMMIT");
        return findUser(id)!;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    async listGroups() {
      return database
        .prepare("SELECT id,name,description FROM groups ORDER BY name")
        .all()
        .map((row) => ({
          id: String(row.id),
          name: String(row.name),
          description: row.description === null ? null : String(row.description),
        }));
    },
    async createGroup(input: { name: string; description?: string | null }) {
      const id = randomUUID(),
        now = Date.now();
      database
        .prepare("INSERT INTO groups(id,name,description,created_at,updated_at) VALUES(?,?,?,?,?)")
        .run(id, input.name, input.description ?? null, now, now);
      return { id, name: input.name, description: input.description ?? null };
    },
    async addGroupMember(groupId: string, userId: string) {
      database
        .prepare("INSERT OR IGNORE INTO group_members(group_id,user_id,created_at) VALUES(?,?,?)")
        .run(groupId, userId, Date.now());
    },
    async assignGroupRole(groupId: string, roleName: string) {
      database
        .prepare(
          "INSERT OR IGNORE INTO group_roles(group_id,role_id) SELECT ?,id FROM roles WHERE name=?",
        )
        .run(groupId, roleName);
    },
    async createGroupWithRoleAndOptionalMember(input: GroupWithRoleInput) {
      const id = randomUUID();
      const now = Date.now();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            "INSERT INTO groups(id,name,description,created_at,updated_at) VALUES(?,?,?,?,?)",
          )
          .run(id, input.name, input.description ?? null, now, now);
        const role = database
          .prepare("INSERT INTO group_roles(group_id,role_id) SELECT ?,id FROM roles WHERE name=?")
          .run(id, input.roleName);
        if (role.changes !== 1) throw new AuthRepositoryError("ROLE_NOT_FOUND");
        if (input.userId)
          database
            .prepare("INSERT INTO group_members(group_id,user_id,created_at) VALUES(?,?,?)")
            .run(id, input.userId, now);
        database.exec("COMMIT");
        return { id, name: input.name, description: input.description ?? null };
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    async isOnboardingCompleted() {
      return Boolean(
        database.prepare("SELECT onboarding_completed FROM server_settings WHERE id='global'").get()
          ?.onboarding_completed,
      );
    },
    async findUser(id: string) {
      return findUser(id);
    },
    async findCredential(name: string) {
      const row = database
        .prepare(
          "SELECT u.id,u.username,u.display_name,u.status,u.is_system_admin,u.auth_version,c.password_hash FROM users u JOIN user_credentials c ON c.user_id=u.id WHERE u.username_canonical=?",
        )
        .get(name);
      return row ? { ...mapSqliteUser(row), passwordHash: String(row.password_hash) } : undefined;
    },
    async markLogin(id: string) {
      database
        .prepare("UPDATE users SET last_login_at=?, updated_at=? WHERE id=?")
        .run(Date.now(), Date.now(), id);
    },
    async createFirstAdmin(input: FirstAdminInput) {
      const id = randomUUID();
      const now = Date.now();
      try {
        database.exec("BEGIN IMMEDIATE");
        const setting = database
          .prepare("SELECT onboarding_completed FROM server_settings WHERE id='global'")
          .get();
        if (setting?.onboarding_completed)
          throw new AuthRepositoryError("ONBOARDING_ALREADY_COMPLETED");
        database
          .prepare(
            "INSERT OR IGNORE INTO roles(id,name,description,created_at,updated_at) VALUES(?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            "SYSTEM_ADMIN",
            "Logical representation of system administrator",
            now,
            now,
          );
        database
          .prepare(
            "INSERT INTO users(id,username,username_canonical,display_name,status,is_system_admin,auth_version,created_at,updated_at) VALUES(?,?,?,?, 'active',1,1,?,?)",
          )
          .run(id, input.username, input.usernameCanonical, input.displayName ?? null, now, now);
        database
          .prepare(
            "INSERT INTO user_credentials(user_id,password_hash,password_updated_at,created_at,updated_at) VALUES(?,?,?,?,?)",
          )
          .run(id, input.passwordHash, now, now, now);
        database
          .prepare(
            "INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE name='SYSTEM_ADMIN'",
          )
          .run(id);
        const result = database
          .prepare(
            "UPDATE server_settings SET onboarding_completed=1,schema_version=2,updated_at=? WHERE id='global' AND onboarding_completed=0",
          )
          .run(now);
        if (result.changes !== 1) throw new AuthRepositoryError("ONBOARDING_ALREADY_COMPLETED");
        database.exec("COMMIT");
        return findUser(id)!;
      } catch (error) {
        try {
          database.exec("ROLLBACK");
        } catch (rollbackError) {
          if (!(rollbackError instanceof Error && rollbackError.message.includes("no transaction")))
            throw rollbackError;
        }
        throw error;
      }
    },
    async changePassword(id: string, passwordHash: string) {
      const now = Date.now();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            "UPDATE user_credentials SET password_hash=?,password_updated_at=?,updated_at=? WHERE user_id=?",
          )
          .run(passwordHash, now, now, id);
        database
          .prepare("UPDATE users SET auth_version=auth_version+1,updated_at=? WHERE id=?")
          .run(now, id);
        database.exec("COMMIT");
        return findUser(id)!.authVersion;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    async setUserStatus(id: string, status: "active" | "disabled") {
      database.exec("BEGIN IMMEDIATE");
      try {
        const user = findUser(id);
        if (!user) throw new Error("User not found");
        if (status === "disabled" && user.isSystemAdmin) {
          const count = Number(
            database
              .prepare(
                "SELECT count(*) count FROM users WHERE is_system_admin=1 AND status='active'",
              )
              .get()?.count ?? 0,
          );
          if (count <= 1) throw new AuthRepositoryError("LAST_SYSTEM_ADMIN");
        }
        database
          .prepare("UPDATE users SET status=?,auth_version=auth_version+1,updated_at=? WHERE id=?")
          .run(status, Date.now(), id);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    async listGroupPermissionGrants(groupId: string) {
      return database
        .prepare(
          "SELECT rp.permission FROM roles r JOIN group_roles gr ON gr.role_id=r.id AND gr.group_id=? JOIN role_permissions rp ON rp.role_id=r.id WHERE r.name=? ORDER BY rp.permission",
        )
        .all(groupId, groupGrantsRoleName(groupId))
        .map((row) => String(row.permission));
    },
    async setGroupPermissionGrants(groupId: string, permissions: readonly string[]) {
      const unique = uniqueGrantPermissions(permissions);
      const roleName = groupGrantsRoleName(groupId);
      const now = Date.now();
      database.exec("BEGIN IMMEDIATE");
      try {
        const group = database.prepare("SELECT id FROM groups WHERE id=?").get(groupId);
        if (!group) throw new AuthRepositoryError("GROUP_NOT_FOUND");
        let roleId = database.prepare("SELECT id FROM roles WHERE name=?").get(roleName)?.id;
        if (typeof roleId !== "string") {
          roleId = randomUUID();
          database
            .prepare(
              "INSERT INTO roles(id,name,description,created_at,updated_at) VALUES(?,?,?,?,?)",
            )
            .run(roleId, roleName, "Additional permission grants for a group", now, now);
        }
        database
          .prepare("INSERT OR IGNORE INTO group_roles(group_id,role_id) VALUES(?,?)")
          .run(groupId, roleId);
        database.prepare("DELETE FROM role_permissions WHERE role_id=?").run(roleId);
        const insert = database.prepare(
          "INSERT INTO role_permissions(role_id,permission) VALUES(?,?)",
        );
        for (const permission of unique) insert.run(roleId, permission);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    async resolvePermissionSubject(id: string) {
      const user = findUser(id);
      if (!user) return undefined;
      const direct = database
        .prepare(
          "SELECT rp.permission FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id WHERE ur.user_id=?",
        )
        .all(id)
        .map((r) => String(r.permission));
      const group = database
        .prepare(
          "SELECT rp.permission FROM group_members gm JOIN group_roles gr ON gr.group_id=gm.group_id JOIN role_permissions rp ON rp.role_id=gr.role_id WHERE gm.user_id=?",
        )
        .all(id)
        .map((r) => String(r.permission));
      return {
        status: user.status,
        isSystemAdmin: user.isSystemAdmin,
        directPermissions: direct,
        groupPermissions: group,
      };
    },
  };
}

export function createPostgresqlAuthStore(pool: Pool) {
  const findUser = async (id: string) => {
    const result = await pool.query(
      "SELECT id,username,display_name,status,is_system_admin,auth_version FROM users WHERE id=$1",
      [id],
    );
    return result.rows[0] ? mapPostgresUser(result.rows[0] as Record<string, unknown>) : undefined;
  };
  return {
    async listUsers() {
      const result = await pool.query(
        "SELECT id,username,display_name,status,is_system_admin,auth_version FROM users ORDER BY username_canonical",
      );
      return result.rows.map((row) => mapPostgresUser(row as Record<string, unknown>));
    },
    async createLocalUser(input: FirstAdminInput & { email?: string | null; roleName: string }) {
      const client = await pool.connect(),
        id = randomUUID();
      try {
        await client.query("BEGIN");
        await client.query(
          "INSERT INTO users(id,username,username_canonical,email,display_name,status,is_system_admin,auth_version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'active',false,1,now(),now())",
          [
            id,
            input.username,
            input.usernameCanonical,
            input.email ?? null,
            input.displayName ?? null,
          ],
        );
        await client.query(
          "INSERT INTO user_credentials(user_id,password_hash,password_updated_at,created_at,updated_at) VALUES($1,$2,now(),now(),now())",
          [id, input.passwordHash],
        );
        await client.query(
          "INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE name=$2",
          [id, input.roleName],
        );
        await client.query("COMMIT");
        return (await findUser(id))!;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async listGroups() {
      const result = await pool.query("SELECT id,name,description FROM groups ORDER BY name");
      return result.rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        description: row.description === null ? null : String(row.description),
      }));
    },
    async createGroup(input: { name: string; description?: string | null }) {
      const id = randomUUID();
      const result = await pool.query(
        "INSERT INTO groups(id,name,description,created_at,updated_at) VALUES($1,$2,$3,now(),now()) RETURNING id,name,description",
        [id, input.name, input.description ?? null],
      );
      return result.rows[0] as { id: string; name: string; description: string | null };
    },
    async addGroupMember(groupId: string, userId: string) {
      await pool.query(
        "INSERT INTO group_members(group_id,user_id,created_at) VALUES($1,$2,now()) ON CONFLICT DO NOTHING",
        [groupId, userId],
      );
    },
    async assignGroupRole(groupId: string, roleName: string) {
      await pool.query(
        "INSERT INTO group_roles(group_id,role_id) SELECT $1,id FROM roles WHERE name=$2 ON CONFLICT DO NOTHING",
        [groupId, roleName],
      );
    },
    async createGroupWithRoleAndOptionalMember(input: GroupWithRoleInput) {
      const client = await pool.connect();
      const id = randomUUID();
      try {
        await client.query("BEGIN");
        const group = await client.query(
          "INSERT INTO groups(id,name,description,created_at,updated_at) VALUES($1,$2,$3,now(),now()) RETURNING id,name,description",
          [id, input.name, input.description ?? null],
        );
        const role = await client.query(
          "INSERT INTO group_roles(group_id,role_id) SELECT $1,id FROM roles WHERE name=$2",
          [id, input.roleName],
        );
        if (role.rowCount !== 1) throw new AuthRepositoryError("ROLE_NOT_FOUND");
        if (input.userId)
          await client.query(
            "INSERT INTO group_members(group_id,user_id,created_at) VALUES($1,$2,now())",
            [id, input.userId],
          );
        await client.query("COMMIT");
        return group.rows[0] as { id: string; name: string; description: string | null };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async isOnboardingCompleted() {
      const result = await pool.query(
        "SELECT onboarding_completed FROM server_settings WHERE id='global'",
      );
      return Boolean(result.rows[0]?.onboarding_completed);
    },
    findUser,
    async findCredential(name: string) {
      const result = await pool.query(
        "SELECT u.id,u.username,u.display_name,u.status,u.is_system_admin,u.auth_version,c.password_hash FROM users u JOIN user_credentials c ON c.user_id=u.id WHERE u.username_canonical=$1",
        [name],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row ? { ...mapPostgresUser(row), passwordHash: String(row.password_hash) } : undefined;
    },
    async markLogin(id: string) {
      await pool.query("UPDATE users SET last_login_at=now(),updated_at=now() WHERE id=$1", [id]);
    },
    async createFirstAdmin(input: FirstAdminInput) {
      const client = await pool.connect();
      const id = randomUUID();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(390003)");
        const state = await client.query(
          "SELECT onboarding_completed FROM server_settings WHERE id='global' FOR UPDATE",
        );
        if (state.rows[0]?.onboarding_completed)
          throw new AuthRepositoryError("ONBOARDING_ALREADY_COMPLETED");
        const role = await client.query(
          "INSERT INTO roles(id,name,description,created_at,updated_at) VALUES($1,'SYSTEM_ADMIN','Logical representation of system administrator',now(),now()) ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING id",
          [randomUUID()],
        );
        await client.query(
          "INSERT INTO users(id,username,username_canonical,display_name,status,is_system_admin,auth_version,created_at,updated_at) VALUES($1,$2,$3,$4,'active',true,1,now(),now())",
          [id, input.username, input.usernameCanonical, input.displayName ?? null],
        );
        await client.query(
          "INSERT INTO user_credentials(user_id,password_hash,password_updated_at,created_at,updated_at) VALUES($1,$2,now(),now(),now())",
          [id, input.passwordHash],
        );
        await client.query("INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)", [
          id,
          role.rows[0].id,
        ]);
        await client.query(
          "UPDATE server_settings SET onboarding_completed=true,schema_version=2,updated_at=now() WHERE id='global'",
        );
        await client.query("COMMIT");
        return (await findUser(id))!;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async changePassword(id: string, passwordHash: string) {
      const result = await pool.query(
        "WITH changed AS (UPDATE user_credentials SET password_hash=$2,password_updated_at=now(),updated_at=now() WHERE user_id=$1) UPDATE users SET auth_version=auth_version+1,updated_at=now() WHERE id=$1 RETURNING auth_version",
        [id, passwordHash],
      );
      return Number(result.rows[0].auth_version);
    },
    async setUserStatus(id: string, status: "active" | "disabled") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(390004)");
        const user = await client.query(
          "SELECT is_system_admin FROM users WHERE id=$1 FOR UPDATE",
          [id],
        );
        if (!user.rows[0]) throw new Error("User not found");
        if (status === "disabled" && user.rows[0].is_system_admin) {
          const count = await client.query(
            "SELECT count(*)::int count FROM users WHERE is_system_admin=true AND status='active'",
          );
          if (Number(count.rows[0].count) <= 1) throw new AuthRepositoryError("LAST_SYSTEM_ADMIN");
        }
        await client.query(
          "UPDATE users SET status=$2,auth_version=auth_version+1,updated_at=now() WHERE id=$1",
          [id, status],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async listGroupPermissionGrants(groupId: string) {
      const result = await pool.query(
        "SELECT rp.permission FROM roles r JOIN group_roles gr ON gr.role_id=r.id AND gr.group_id=$1 JOIN role_permissions rp ON rp.role_id=r.id WHERE r.name=$2 ORDER BY rp.permission",
        [groupId, groupGrantsRoleName(groupId)],
      );
      return result.rows.map((row) => String(row.permission));
    },
    async setGroupPermissionGrants(groupId: string, permissions: readonly string[]) {
      const unique = uniqueGrantPermissions(permissions);
      const roleName = groupGrantsRoleName(groupId);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const group = await client.query("SELECT id FROM groups WHERE id=$1 FOR UPDATE", [groupId]);
        if (!group.rows[0]) throw new AuthRepositoryError("GROUP_NOT_FOUND");
        const existing = await client.query("SELECT id FROM roles WHERE name=$1", [roleName]);
        let roleId = existing.rows[0]?.id as string | undefined;
        if (!roleId) {
          roleId = randomUUID();
          await client.query(
            "INSERT INTO roles(id,name,description,created_at,updated_at) VALUES($1,$2,$3,now(),now())",
            [roleId, roleName, "Additional permission grants for a group"],
          );
        }
        await client.query(
          "INSERT INTO group_roles(group_id,role_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [groupId, roleId],
        );
        await client.query("DELETE FROM role_permissions WHERE role_id=$1", [roleId]);
        for (const permission of unique)
          await client.query("INSERT INTO role_permissions(role_id,permission) VALUES($1,$2)", [
            roleId,
            permission,
          ]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async resolvePermissionSubject(id: string) {
      const user = await findUser(id);
      if (!user) return undefined;
      const direct = await pool.query(
        "SELECT rp.permission FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id WHERE ur.user_id=$1",
        [id],
      );
      const group = await pool.query(
        "SELECT rp.permission FROM group_members gm JOIN group_roles gr ON gr.group_id=gm.group_id JOIN role_permissions rp ON rp.role_id=gr.role_id WHERE gm.user_id=$1",
        [id],
      );
      return {
        status: user.status,
        isSystemAdmin: user.isSystemAdmin,
        directPermissions: direct.rows.map((r) => String(r.permission)),
        groupPermissions: group.rows.map((r) => String(r.permission)),
      };
    },
  };
}
