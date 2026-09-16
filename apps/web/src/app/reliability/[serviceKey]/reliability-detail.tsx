"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, ConfirmDialog, Field, Input, Select } from "@dashboard/ui";
import type { DailyReliabilityRollup, ServiceSlo, SloComputation } from "@dashboard/reliability";
import { createSloAction, deleteSloAction, updateSloAction } from "../actions";
import { dailyRollupsToCsv, downloadCsv } from "../csv";
import { DailySparkline } from "../daily-sparkline";
import {
  SLO_WINDOW_LABELS,
  formatBasisPoints,
  formatSeconds,
  formatUtcDate,
  sloStatusLabel,
  sloStatusTone,
} from "../labels";

type SloEvaluation = {
  slo: ServiceSlo;
  computation: SloComputation;
  fromDateUtc: string;
  toDateUtc: string;
};

export function ReliabilityDetail({
  serviceKey,
  serviceLabel,
  days,
  slos,
  evaluations,
  canManageSlo,
}: {
  serviceKey: string;
  serviceLabel: string;
  days: DailyReliabilityRollup[];
  slos: ServiceSlo[];
  evaluations: SloEvaluation[];
  canManageSlo: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [createObjective, setCreateObjective] = useState("99.9");
  const [createWindowDays, setCreateWindowDays] = useState<"7" | "30" | "90">("30");
  const [createExcludeMaintenance, setCreateExcludeMaintenance] = useState(true);

  const evaluationBySloId = useMemo(() => {
    const map = new Map<string, SloEvaluation>();
    for (const entry of evaluations) map.set(entry.slo.id, entry);
    return map;
  }, [evaluations]);

  const sortedDays = useMemo(
    () => [...days].sort((a, b) => b.dateUtc.localeCompare(a.dateUtc)),
    [days],
  );

  function run(action: () => Promise<void>) {
    startTransition(() => {
      void action();
    });
  }

  function parseObjectivePercent(value: string): number | null {
    const parsed = Number.parseFloat(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 90 || parsed >= 100) return null;
    return Math.round(parsed * 1000);
  }

  function onExportCsv() {
    downloadCsv(`reliability-${serviceKey}.csv`, dailyRollupsToCsv(days));
  }

  return (
    <div className="ui-stack reliability-detail" style={{ display: "grid", gap: "1.25rem" }}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {info ? <Alert tone="success">{info}</Alert> : null}

      <section className="ui-card ui-form-card">
        <h2 className="ui-section-title">Résumé</h2>
        <dl className="status-page-summary">
          <div>
            <dt>Service</dt>
            <dd>{serviceLabel}</dd>
          </div>
          <div>
            <dt>Clé</dt>
            <dd>
              <code>{serviceKey}</code>
            </dd>
          </div>
          <div>
            <dt>Jours observés</dt>
            <dd>{sortedDays.length}</dd>
          </div>
        </dl>
        <div style={{ marginTop: "1rem" }}>
          <DailySparkline days={days} />
        </div>
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Button
            type="button"
            variant="secondary"
            onClick={onExportCsv}
            data-testid="reliability-export-csv"
          >
            Exporter CSV
          </Button>
        </div>
      </section>

      <section className="ui-card ui-form-card">
        <h2 className="ui-section-title">Objectifs SLO</h2>
        {slos.length === 0 ? (
          <p>Aucun objectif SLO configuré pour ce service.</p>
        ) : (
          <div className="ui-table-wrap">
            <table className="ui-table" data-testid="reliability-slo-table">
              <thead>
                <tr>
                  <th scope="col">Nom</th>
                  <th scope="col">Objectif</th>
                  <th scope="col">Fenêtre</th>
                  <th scope="col">Disponibilité</th>
                  <th scope="col">État</th>
                  <th scope="col">Budget restant</th>
                  {canManageSlo ? <th scope="col">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {slos.map((slo) => {
                  const evaluation = evaluationBySloId.get(slo.id);
                  const availability = evaluation?.computation.availabilityBasisPoints ?? null;
                  const met =
                    availability !== null ? availability >= slo.objectiveBasisPoints : null;
                  return (
                    <SloRow
                      key={slo.id}
                      slo={slo}
                      serviceKey={serviceKey}
                      evaluation={evaluation}
                      met={met}
                      canManage={canManageSlo}
                      pending={pending}
                      onError={setError}
                      onInfo={setInfo}
                      onDelete={() => setConfirmDeleteId(slo.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {canManageSlo ? (
          <form
            className="ui-form"
            style={{ marginTop: "1.25rem" }}
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              setInfo(null);
              const objectiveBasisPoints = parseObjectivePercent(createObjective);
              if (objectiveBasisPoints === null) {
                setError("Objectif invalide (90,000 % – 99,999 %).");
                return;
              }
              run(async () => {
                const result = await createSloAction({
                  serviceKey,
                  name: createName.trim(),
                  objectiveBasisPoints,
                  windowDays: Number(createWindowDays) as 7 | 30 | 90,
                  excludeMaintenance: createExcludeMaintenance,
                  enabled: true,
                });
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setCreateName("");
                setInfo("Objectif SLO créé.");
                router.refresh();
              });
            }}
          >
            <h3 className="ui-section-title">Nouvel objectif SLO</h3>
            <Field label="Nom">
              <Input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                required
                data-testid="reliability-slo-name"
              />
            </Field>
            <Field label="Objectif (%)">
              <Input
                value={createObjective}
                onChange={(event) => setCreateObjective(event.target.value)}
                required
                data-testid="reliability-slo-objective"
              />
            </Field>
            <Field label="Fenêtre">
              <Select
                value={createWindowDays}
                onChange={(event) => setCreateWindowDays(event.target.value as "7" | "30" | "90")}
                data-testid="reliability-slo-window"
              >
                <option value="7">7 jours</option>
                <option value="30">30 jours</option>
                <option value="90">90 jours</option>
              </Select>
            </Field>
            <label className="ui-field ui-checkbox">
              <input
                type="checkbox"
                checked={createExcludeMaintenance}
                onChange={(event) => setCreateExcludeMaintenance(event.target.checked)}
              />
              Exclure la maintenance du dénominateur
            </label>
            <Button type="submit" disabled={pending} data-testid="reliability-slo-create">
              Créer l’objectif
            </Button>
          </form>
        ) : null}
      </section>

      <section className="ui-card ui-form-card">
        <h2 className="ui-section-title">Historique quotidien (UTC)</h2>
        {sortedDays.length === 0 ? (
          <p data-testid="reliability-daily-empty">Aucune donnée quotidienne pour ce service.</p>
        ) : null}
        <div className="ui-table-wrap">
          <table className="ui-table" data-testid="reliability-daily-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Observé</th>
                <th scope="col">Disponible</th>
                <th scope="col">Indisponible</th>
                <th scope="col">Maintenance</th>
                <th scope="col">Inconnu</th>
                <th scope="col">Incidents</th>
              </tr>
            </thead>
            <tbody>
              {sortedDays.map((day) => (
                <tr key={day.dateUtc} data-testid={`reliability-day-${day.dateUtc}`}>
                  <td>{formatUtcDate(day.dateUtc)}</td>
                  <td>{formatSeconds(day.observedSeconds)}</td>
                  <td>{formatSeconds(day.availableSeconds)}</td>
                  <td>{formatSeconds(day.unavailableSeconds + day.degradedSeconds)}</td>
                  <td>{formatSeconds(day.maintenanceSeconds)}</td>
                  <td>{formatSeconds(day.unknownSeconds)}</td>
                  <td>{day.incidentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {confirmDeleteId ? (
        <ConfirmDialog
          title="Supprimer l’objectif SLO ?"
          confirmLabel="Supprimer"
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => {
            const slo = slos.find((entry) => entry.id === confirmDeleteId);
            if (!slo) {
              setConfirmDeleteId(null);
              return;
            }
            run(async () => {
              const result = await deleteSloAction({
                id: slo.id,
                expectedConfigRevision: slo.configRevision,
                serviceKey,
              });
              setConfirmDeleteId(null);
              if (!result.ok) {
                setError(result.message);
                return;
              }
              setInfo("Objectif SLO supprimé.");
              router.refresh();
            });
          }}
        >
          <p>Cette action est définitive.</p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function SloRow({
  slo,
  serviceKey,
  evaluation,
  met,
  canManage,
  pending,
  onError,
  onInfo,
  onDelete,
}: {
  slo: ServiceSlo;
  serviceKey: string;
  evaluation: SloEvaluation | undefined;
  met: boolean | null;
  canManage: boolean;
  pending: boolean;
  onError: (message: string) => void;
  onInfo: (message: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(slo.name);
  const [objective, setObjective] = useState(String(slo.objectiveBasisPoints / 1000));
  const [windowDays, setWindowDays] = useState(String(slo.windowDays));
  const [excludeMaintenance, setExcludeMaintenance] = useState(slo.excludeMaintenance);
  const [enabled, setEnabled] = useState(slo.enabled);

  if (editing && canManage) {
    return (
      <tr data-testid={`reliability-slo-row-${slo.id}`}>
        <td colSpan={canManage ? 7 : 6}>
          <form
            className="ui-form"
            onSubmit={(event) => {
              event.preventDefault();
              onError("");
              const objectiveBasisPoints = Math.round(
                Number.parseFloat(objective.replace(",", ".")) * 1000,
              );
              if (!Number.isFinite(objectiveBasisPoints)) {
                onError("Objectif invalide.");
                return;
              }
              void updateSloAction({
                id: slo.id,
                expectedConfigRevision: slo.configRevision,
                name: name.trim(),
                objectiveBasisPoints,
                windowDays: Number(windowDays) as 7 | 30 | 90,
                excludeMaintenance,
                enabled,
                serviceKey,
              }).then((result) => {
                if (!result.ok) {
                  onError(result.message);
                  return;
                }
                onInfo("Objectif SLO mis à jour.");
                setEditing(false);
              });
            }}
          >
            <Field label="Nom">
              <Input value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label="Objectif (%)">
              <Input
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                required
              />
            </Field>
            <Field label="Fenêtre">
              <Select value={windowDays} onChange={(event) => setWindowDays(event.target.value)}>
                <option value="7">7 jours</option>
                <option value="30">30 jours</option>
                <option value="90">90 jours</option>
              </Select>
            </Field>
            <label className="ui-field ui-checkbox">
              <input
                type="checkbox"
                checked={excludeMaintenance}
                onChange={(event) => setExcludeMaintenance(event.target.checked)}
              />
              Exclure la maintenance
            </label>
            <label className="ui-field ui-checkbox">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              Activé
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button type="submit" disabled={pending}>
                Enregistrer
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Annuler
              </Button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr data-testid={`reliability-slo-row-${slo.id}`}>
      <td>{slo.name}</td>
      <td>{formatBasisPoints(slo.objectiveBasisPoints)}</td>
      <td>{SLO_WINDOW_LABELS[slo.windowDays]}</td>
      <td>{formatBasisPoints(evaluation?.computation.availabilityBasisPoints ?? null)}</td>
      <td>
        <Badge tone={sloStatusTone(met)}>{sloStatusLabel(met)}</Badge>
      </td>
      <td>{formatBasisPoints(evaluation?.computation.remainingBudgetBasisPoints ?? null)}</td>
      {canManage ? (
        <td>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
              Modifier
            </Button>
            <Button type="button" variant="ghost" onClick={onDelete}>
              Supprimer
            </Button>
          </div>
        </td>
      ) : null}
    </tr>
  );
}
