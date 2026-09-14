import { BACKUP_TABLE_NAMES, type BackupTableName } from "./columns";
import type { BackupArchive } from "./schema";

export interface BackupPreview {
  format: string;
  formatVersion: number;
  schemaVersion: number;
  databaseSchemaVersion: number;
  appVersion: string;
  createdAt: string;
  compatible: true;
  tableCounts: Record<BackupTableName, number>;
  encryptedSecretCount: number;
  credentialCount: number;
  files: { name: string; sha256: string; bytes: number }[];
}

export function previewArchive(archive: BackupArchive): BackupPreview {
  const tableCounts = Object.fromEntries(
    BACKUP_TABLE_NAMES.map((name) => [name, archive.tables[name].length]),
  ) as Record<BackupTableName, number>;
  return {
    format: archive.manifest.format,
    formatVersion: archive.manifest.formatVersion,
    schemaVersion: archive.manifest.schemaVersion,
    databaseSchemaVersion: archive.manifest.databaseSchemaVersion,
    appVersion: archive.manifest.appVersion,
    createdAt: archive.manifest.createdAt,
    compatible: true,
    tableCounts,
    encryptedSecretCount:
      archive.tables.integration_secrets.length + archive.tables.oidc_secrets.length,
    credentialCount: archive.tables.user_credentials.length,
    files: archive.manifest.files.map((file) => ({
      name: file.name,
      sha256: file.sha256,
      bytes: file.bytes,
    })),
  };
}
