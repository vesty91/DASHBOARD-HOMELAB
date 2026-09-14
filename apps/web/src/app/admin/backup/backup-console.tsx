"use client";

import { useState } from "react";
import { Alert, Button, ConfirmDialog, Field, Input } from "@dashboard/ui";
import type { BackupArchive, BackupPreview, BackupRestoreResult } from "@dashboard/backup";
import { exportBackupAction, restoreBackupAction, validateBackupAction } from "./actions";

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BackupConsole() {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [pendingArchive, setPendingArchive] = useState<unknown>(null);
  const [exported, setExported] = useState<BackupArchive | null>(null);
  const [restored, setRestored] = useState<BackupRestoreResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onExport() {
    setError(null);
    setBusy(true);
    try {
      const archive = await exportBackupAction();
      setExported(archive);
      downloadJson("homelab-dashboard-backup.json", archive);
    } catch {
      setError("Export de backup impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    setError(null);
    setPreview(null);
    setPendingArchive(null);
    setRestored(null);
    if (!file) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const result = await validateBackupAction(parsed);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPendingArchive(parsed);
      setPreview(result.preview);
    } catch {
      setError("Fichier de backup invalide.");
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    if (!pendingArchive) return;
    setBusy(true);
    setConfirming(false);
    try {
      const result = await restoreBackupAction(pendingArchive);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRestored(result.result);
      downloadJson("homelab-dashboard-pre-restore.json", result.result.preRestore);
    } catch {
      setError("Restauration de backup impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="home-grid">
      {error ? (
        <Alert tone="danger" title="Backup rejeté">
          {error}
        </Alert>
      ) : null}
      {exported ? (
        <Alert tone="success" title="Export prêt">
          Manifest {exported.manifest.format} v{exported.manifest.formatVersion}, schéma{" "}
          {exported.manifest.schemaVersion}.
        </Alert>
      ) : null}
      {preview ? (
        <Alert tone="info" title="Prévisualisation">
          Schéma {preview.schemaVersion}, {preview.tableCounts.users} utilisateur(s),{" "}
          {preview.encryptedSecretCount} secret(s) chiffré(s). Aucune mutation n'a été appliquée.
        </Alert>
      ) : null}
      {restored ? (
        <Alert tone="success" title="Restore terminé">
          L'archive précédente a été téléchargée avant remplacement.
        </Alert>
      ) : null}
      <div className="ui-form ui-card ui-form-card">
        <h2 className="ui-section-title">Exporter</h2>
        <p className="ui-muted">
          Archive JSON versionnée. Les secrets d'intégration restent chiffrés.
        </p>
        <Button variant="primary" onClick={() => void onExport()} disabled={busy}>
          Exporter le backup
        </Button>
      </div>
      <div className="ui-form ui-card ui-form-card">
        <h2 className="ui-section-title">Valider puis restaurer</h2>
        <Field
          label="Archive de backup"
          hint="Le fichier est validé sans mutation. La restauration remplace l'instance."
        >
          <Input
            type="file"
            accept="application/json,.json"
            onChange={(event) => void onFile(event.target.files?.[0])}
            disabled={busy}
          />
        </Field>
        {preview ? (
          confirming ? (
            <ConfirmDialog
              title="Confirmer la restauration"
              onCancel={() => setConfirming(false)}
              onConfirm={() => void onRestore()}
              confirmLabel="Restaurer définitivement"
            >
              <p>
                Remplacer toute l'instance par cette archive ? Un backup pré-restore sera généré
                avant la mutation.
              </p>
            </ConfirmDialog>
          ) : (
            <Button variant="danger" onClick={() => setConfirming(true)} disabled={busy}>
              Restaurer cette archive
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}
