"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, ConfirmDialog, Field, Input } from "@dashboard/ui";
import type { AutomationRuleView, AutomationRunView } from "@dashboard/automations";
import {
  deleteAutomationAction,
  dryRunAutomationAction,
  manualRunAutomationAction,
  setAutomationEnabledAction,
  updateAutomationAction,
} from "../actions";
import {
  DRY_RUN_LABELS,
  RUN_STATUS_LABELS,
  TRIGGER_LABELS,
  formatTimestamp,
} from "../automation-labels";

export function AutomationDetail({
  rule,
  runs,
  canManage,
  canRun,
}: {
  rule: AutomationRuleView;
  runs: AutomationRunView[];
  canManage: boolean;
  canRun: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(rule.name);
  const [description, setDescription] = useState(rule.description ?? "");
  const [cooldownSeconds, setCooldownSeconds] = useState(rule.cooldownSeconds);
  const [revision, setRevision] = useState(rule.configRevision);

  function run(action: () => Promise<void>) {
    startTransition(() => {
      void action();
    });
  }

  return (
    <div className="ui-stack" style={{ display: "grid", gap: "1.25rem" }}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {info ? <Alert tone="success">{info}</Alert> : null}

      <section className="ui-card ui-form-card">
        <h2 className="ui-section-title">Résumé</h2>
        <p>
          <strong>État :</strong> {rule.enabled ? "Activée" : "Désactivée"}
        </p>
        <p>
          <strong>Déclencheur :</strong> {TRIGGER_LABELS[rule.triggerType]}
        </p>
        <p>
          <strong>Action :</strong> <code>{rule.actionType}</code>
        </p>
        <p>
          <strong>Dernière exécution :</strong>{" "}
          {formatTimestamp(rule.lastCompletedAt ?? rule.lastTriggeredAt)} (
          {rule.lastRunStatus ?? "—"})
        </p>
        <p>
          <strong>Prochaine (schedule) :</strong>{" "}
          {rule.triggerType === "schedule" ? formatTimestamp(rule.nextRunAt) : "—"}
        </p>
        <p>
          <strong>Révision :</strong> {revision}
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
          {canManage ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  setError(null);
                  setInfo(null);
                  const result = await setAutomationEnabledAction({
                    id: rule.id,
                    enabled: !rule.enabled,
                    expectedConfigRevision: revision,
                  });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setRevision((value) => value + 1);
                  setInfo(rule.enabled ? "Automation désactivée." : "Automation activée.");
                  router.refresh();
                })
              }
            >
              {rule.enabled ? "Désactiver" : "Activer"}
            </Button>
          ) : null}
          {canRun ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    setError(null);
                    setInfo(null);
                    const result = await dryRunAutomationAction(rule.id);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    setInfo(
                      `Dry-run : ${DRY_RUN_LABELS[result.result.outcome]} (${result.result.reasonCode})`,
                    );
                  })
                }
              >
                Dry-run
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    setError(null);
                    setInfo(null);
                    const result = await manualRunAutomationAction(rule.id);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    setInfo(
                      `Exécution manuelle : ${result.result.status}${
                        result.result.errorCode ? ` (${result.result.errorCode})` : ""
                      }`,
                    );
                    router.refresh();
                  })
                }
              >
                Exécuter
              </Button>
            </>
          ) : null}
          {canManage ? (
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() => setConfirmDelete(true)}
            >
              Supprimer
            </Button>
          ) : null}
        </div>
      </section>

      {canManage ? (
        <section className="ui-form ui-card ui-form-card ui-form-grid">
          <h2 className="ui-section-title">Modifier</h2>
          <Field label="Nom">
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
          </Field>
          <Field label="Description">
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
            />
          </Field>
          <Field label="Cooldown (secondes)">
            <Input
              type="number"
              min={0}
              max={86400}
              value={cooldownSeconds}
              onChange={(event) => setCooldownSeconds(Number(event.target.value))}
            />
          </Field>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                setError(null);
                setInfo(null);
                const result = await updateAutomationAction(rule.id, {
                  expectedConfigRevision: revision,
                  name: name.trim(),
                  description: description.trim() ? description.trim() : null,
                  cooldownSeconds,
                });
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setRevision((value) => value + 1);
                setInfo("Automation mise à jour.");
                router.refresh();
              })
            }
          >
            Enregistrer les modifications
          </Button>
        </section>
      ) : null}

      <section className="ui-card ui-form-card">
        <h2 className="ui-section-title">Historique</h2>
        {runs.length === 0 ? (
          <p className="ui-muted">Aucune exécution enregistrée.</p>
        ) : (
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">Démarré</th>
                  <th scope="col">Planifié</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Durée</th>
                  <th scope="col">Déclencheur</th>
                  <th scope="col">Action</th>
                  <th scope="col">Ressource</th>
                  <th scope="col">Erreur</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((runItem) => (
                  <tr key={runItem.id}>
                    <td>{formatTimestamp(runItem.startedAt)}</td>
                    <td>{formatTimestamp(runItem.scheduledFor)}</td>
                    <td>{RUN_STATUS_LABELS[runItem.status] ?? runItem.status}</td>
                    <td>{runItem.durationMs != null ? `${runItem.durationMs} ms` : "—"}</td>
                    <td>{TRIGGER_LABELS[runItem.triggerType]}</td>
                    <td>
                      <code>{runItem.actionType}</code>
                    </td>
                    <td>{runItem.resourceId ?? "—"}</td>
                    <td>{runItem.errorCode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirmDelete ? (
        <ConfirmDialog
          title="Confirmer la suppression"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            run(async () => {
              setConfirmDelete(false);
              const result = await deleteAutomationAction(rule.id);
              if (!result.ok) {
                setError(result.message);
                return;
              }
              router.push("/automations");
              router.refresh();
            })
          }
          confirmLabel="Supprimer définitivement"
        >
          <p>
            Supprimer cette automation ? L’historique d’exécution est conservé selon la politique de
            rétention.
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
