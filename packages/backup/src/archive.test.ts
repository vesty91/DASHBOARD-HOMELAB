import { describe, expect, it } from "vitest";
import {
  BACKUP_APP_VERSION,
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  BackupError,
  MAX_BACKUP_ARCHIVE_BYTES,
  buildArchive,
  canonicalJson,
  emptyBackupTables,
  parseBackupArchive,
  previewArchive,
  sha256Hex,
} from "./index";

function validTables() {
  const tables = emptyBackupTables();
  tables.server_settings = [
    {
      id: "global",
      schemaVersion: BACKUP_SCHEMA_VERSION,
      instanceName: null,
      onboardingCompleted: true,
      oidcEnabled: false,
      oidcIssuer: null,
      oidcClientId: null,
      oidcDisplayName: null,
      oidcScopes: "openid profile email groups",
      oidcRedirectUri: null,
      oidcGroupClaim: "groups",
      oidcAutoLinkVerifiedEmail: false,
      oidcAutoProvision: false,
      oidcAllowLocalLogin: true,
      createdAt: "2026-09-14T12:00:00.000Z",
      updatedAt: "2026-09-14T12:00:00.000Z",
    },
  ];
  tables.users = [
    {
      id: "00000000-0000-4000-8000-000000000011",
      username: "admin",
      usernameCanonical: "admin",
      email: null,
      displayName: "Admin",
      status: "active",
      isSystemAdmin: true,
      authVersion: 1,
      createdAt: "2026-09-14T12:00:00.000Z",
      updatedAt: "2026-09-14T12:00:00.000Z",
      lastLoginAt: null,
    },
  ];
  tables.integration_secrets = [
    {
      id: "00000000-0000-4000-8000-000000000021",
      integrationId: "00000000-0000-4000-8000-000000000022",
      key: "apiKey",
      ciphertext: "cipher-not-plaintext",
      iv: "iv-value",
      authTag: "tag-value",
      keyVersion: 1,
      createdAt: "2026-09-14T12:00:00.000Z",
      updatedAt: "2026-09-14T12:00:00.000Z",
    },
  ];
  return tables;
}

describe("backup archive", () => {
  it("builds a versioned manifest with integrity hashes", () => {
    const archive = buildArchive(validTables(), "2026-09-14T12:00:00.000Z");
    expect(archive.manifest.appVersion).toBe(BACKUP_APP_VERSION);
    expect(BACKUP_APP_VERSION).toBe("1.7.0");
    expect(archive.manifest.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(archive.manifest.databaseSchemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(archive.manifest.files[0]?.name).toBe("tables.json");
    expect(archive.manifest.files[0]?.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(parseBackupArchive(archive)).toEqual(archive);
    const preview = previewArchive(archive);
    expect(JSON.stringify(preview)).not.toMatch(/cipher-not-plaintext|password/iu);
    expect(preview.encryptedSecretCount).toBe(1);
    expect(preview.tableCounts.users).toBe(1);
  });

  it("rejects unknown tables, unknown columns and plaintext secret fields", () => {
    const archive = buildArchive(validTables(), "2026-09-14T12:00:00.000Z");
    expect(() => parseBackupArchive({ ...archive, extra: true })).toThrow(BackupError);
    expect(() =>
      parseBackupArchive({
        ...archive,
        tables: {
          ...archive.tables,
          mystery: [],
        },
      }),
    ).toThrow(BackupError);
    expect(() =>
      parseBackupArchive({
        ...archive,
        tables: {
          ...archive.tables,
          users: [{ ...archive.tables.users[0], token: "nopenopenope" }],
        },
      }),
    ).toThrow(BackupError);
    const withPlaintext = structuredClone(archive);
    withPlaintext.tables.integrations = [
      {
        id: "00000000-0000-4000-8000-000000000031",
        type: "docker",
        name: "Docker",
        baseUrl: "http://127.0.0.1:2375",
        enabled: true,
        configJson: { apiKey: "super-secret" },
        status: "unknown",
        lastCheckedAt: null,
        configRevision: 1,
        createdBy: null,
        createdAt: "2026-09-14T12:00:00.000Z",
        updatedAt: "2026-09-14T12:00:00.000Z",
      },
    ];
    withPlaintext.manifest.files = [
      {
        name: "tables.json",
        sha256: archive.manifest.files[0]!.sha256,
        bytes: archive.manifest.files[0]!.bytes,
      },
    ];
    expect(() => parseBackupArchive(withPlaintext)).toThrow(BackupError);
  });

  it("rejects incompatible schema versions and tampered hashes before use", () => {
    const archive = buildArchive(validTables(), "2026-09-14T12:00:00.000Z");
    expect(() =>
      parseBackupArchive({
        ...archive,
        manifest: { ...archive.manifest, schemaVersion: 13, databaseSchemaVersion: 13 },
      }),
    ).toThrow(BackupError);
    try {
      parseBackupArchive({
        ...archive,
        manifest: { ...archive.manifest, schemaVersion: 13, databaseSchemaVersion: 13 },
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "INCOMPATIBLE_SCHEMA" });
    }
    expect(() =>
      parseBackupArchive({
        ...archive,
        manifest: {
          ...archive.manifest,
          files: [
            {
              name: "tables.json",
              sha256: "a".repeat(64),
              bytes: archive.manifest.files[0]!.bytes,
            },
          ],
        },
      }),
    ).toThrow(BackupError);
    expect(() => parseBackupArchive("{not-json")).toThrow(BackupError);
    try {
      parseBackupArchive("x".repeat(MAX_BACKUP_ARCHIVE_BYTES + 1));
    } catch (error) {
      expect(error).toMatchObject({ code: "TOO_LARGE" });
    }
    expect(() => buildArchive(emptyBackupTables(), "2026-09-14T12:00:00.000Z")).toThrow(
      BackupError,
    );
  });

  it("upgrades a schema 5 archive and keeps OIDC tables empty", () => {
    const tables = {
      users: validTables().users,
      groups: [],
      group_members: [],
      boards: [],
      layouts: [],
      items: [],
      item_layouts: [],
      apps: [],
      app_tags: [],
      integrations: [],
      integration_secrets: validTables().integration_secrets,
      server_settings: [
        {
          id: "global" as const,
          schemaVersion: 5,
          instanceName: null,
          onboardingCompleted: true,
          createdAt: "2026-09-14T12:00:00.000Z",
          updatedAt: "2026-09-14T12:00:00.000Z",
        },
      ],
      user_credentials: [],
      roles: [],
      role_permissions: [],
      user_roles: [],
      group_roles: [],
      board_user_permissions: [],
      board_group_permissions: [],
      jobs: [],
    };
    const canonical = canonicalJson(tables);
    const hashed = {
      sha256: sha256Hex(canonical),
      bytes: Buffer.byteLength(canonical, "utf8"),
    };
    const parsed = parseBackupArchive({
      manifest: {
        format: BACKUP_FORMAT,
        formatVersion: 1,
        schemaVersion: 5,
        databaseSchemaVersion: 5,
        appVersion: "0.1.0",
        createdAt: "2026-09-14T12:00:00.000Z",
        files: [{ name: "tables.json", sha256: hashed.sha256, bytes: hashed.bytes }],
      },
      tables,
    });
    expect(parsed.manifest.schemaVersion).toBe(5);
    expect(parsed.tables.oidc_identities).toEqual([]);
    expect(parsed.tables.server_settings[0]?.oidcEnabled).toBe(false);
    expect(parsed.tables.oidc_secrets).toEqual([]);
    expect(parsed.tables.automation_rules).toEqual([]);
    expect(parsed.tables.status_pages).toEqual([]);
    expect(parsed.tables.service_slos).toEqual([]);
    expect(parsed.tables.slo_alert_policies).toEqual([]);
  });

  it("upgrades a schema 6 archive with empty automation rules", () => {
    const tables = {
      ...validTables(),
    };
    delete (tables as { automation_rules?: unknown }).automation_rules;
    delete (tables as { status_pages?: unknown }).status_pages;
    delete (tables as { status_page_services?: unknown }).status_page_services;
    delete (tables as { maintenance_windows?: unknown }).maintenance_windows;
    delete (tables as { maintenance_window_targets?: unknown }).maintenance_window_targets;
    delete (tables as { service_slos?: unknown }).service_slos;
    delete (tables as { slo_alert_policies?: unknown }).slo_alert_policies;
    const canonical = canonicalJson(tables);
    const hashed = {
      sha256: sha256Hex(canonical),
      bytes: Buffer.byteLength(canonical, "utf8"),
    };
    const parsed = parseBackupArchive({
      manifest: {
        format: BACKUP_FORMAT,
        formatVersion: 1,
        schemaVersion: 6,
        databaseSchemaVersion: 6,
        appVersion: "1.7.0",
        createdAt: "2026-09-14T12:00:00.000Z",
        files: [{ name: "tables.json", sha256: hashed.sha256, bytes: hashed.bytes }],
      },
      tables,
    });
    expect(parsed.manifest.schemaVersion).toBe(6);
    expect(parsed.tables.automation_rules).toEqual([]);
    expect(parsed.tables.status_pages).toEqual([]);
    expect(parsed.tables.service_slos).toEqual([]);
    expect(parsed.tables.slo_alert_policies).toEqual([]);
    expect(parsed.tables.oidc_identities).toEqual([]);
  });
});
