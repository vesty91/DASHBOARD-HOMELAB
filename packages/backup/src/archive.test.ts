import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  BackupError,
  buildArchive,
  emptyBackupTables,
  parseBackupArchive,
  previewArchive,
} from "./index";

function validTables() {
  const tables = emptyBackupTables();
  tables.server_settings = [
    {
      id: "global",
      schemaVersion: 2,
      instanceName: null,
      onboardingCompleted: true,
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
    expect(archive.manifest.format).toBe(BACKUP_FORMAT);
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
        manifest: { ...archive.manifest, schemaVersion: 6, databaseSchemaVersion: 6 },
      }),
    ).toThrow(BackupError);
    try {
      parseBackupArchive({
        ...archive,
        manifest: { ...archive.manifest, schemaVersion: 6, databaseSchemaVersion: 6 },
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
    expect(() => buildArchive(emptyBackupTables(), "2026-09-14T12:00:00.000Z")).toThrow(
      BackupError,
    );
  });
});
