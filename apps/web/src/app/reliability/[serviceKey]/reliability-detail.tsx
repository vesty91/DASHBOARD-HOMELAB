"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, ConfirmDialog, Field, Input, Select } from "@dashboard/ui";
import type {
  BurnRateEvaluation,
  BurnRateState,
  DailyReliabilityRollup,
  ServiceSlo,
  SloComputation,
} from "@dashboard/reliability";
import {
  createAlertPolicyAction,
  createSloAction,
  deleteAlertPolicyAction,
  deleteSloAction,
  updateAlertPolicyAction,
  updateSloAction,
} from "../actions";
import { dailyRollupsToCsv, downloadCsv } from "../csv";
import { DailySparkline } from "../daily-sparkline";
import {
  BURN_STATE_LABELS,
  SLO_WINDOW_LABELS,
  burnStateTone,
  formatBasisPoints,
  formatBudgetRemaining,
  formatBurnRate,
  formatSeconds,
  formatUtcDate,
  formatUtcDateTime,
  sloStatusLabel,
  sloStatusTone,
} from "../labels";

type SloEvaluation = {
  slo: ServiceSlo;
  computation: SloComputation;
  fromDateUtc: string;
  toDateUtc: string;
};

type SerializedAlertPolicy = {
  id: string;
  sloId: string;
  enabled: boolean;
  warningThreshold: number;
  criticalThreshold: number;
  cooldownSeconds: number;
  notifyOnRecovery: boolean;
  configRevision: number;
  createdAt: string;
  updatedAt: string;
};

type SerializedAlertRuntime = {
  sloId: string;
  lastState: BurnRateState;
  lastNotifiedState: BurnRateState | null;
  lastNotifiedAt: string | null;
  lastTransitionAt: string | null;
  lastBurnRate: number | null;
  updatedAt: string;
};

type SloBurnBundle = {
  evaluation: BurnRateEvaluation;
  policy: SerializedAlertPolicy | null;
  runtime: SerializedAlertRuntime | null;
};

export function ReliabilityDetail({
  serviceKey,
  serviceLabel,
  days,
  slos,
  evaluations,
  burnBySloId,
  canManageSlo,
}: {
  serviceKey: string;
  serviceLabel: string;
  days: DailyReliabilityRollup[];
  slos: ServiceSlo[];
  evaluations: SloEvaluation[];
  burnBySloId: Record<string, SloBurnBundle>;
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
      <p className="ui-muted" data-testid="reliability-service-label">
        Service : {serviceLabel}
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {info ? <Alert tone="success">{info}</Alert> : null}

      <section className="ui-card ui-form-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <h2 className="ui-section-title">Tendance (90 j)</h2>
          <Button
            type="button"
            variant="ghost"
            onClick={onExportCsv}
            data-testid="reliability-export-csv"
          >
            Exporter CSV
          </Button>
        </div>
        <DailySparkline days={days} />
      </section>

      <section className="ui-card ui-form-card">
        <h2 className="ui-section-title">Objectifs SLO</h2>
        {slos.length === 0 ? (
          <p data-testid="reliability-slo-empty">Aucun objectif configuré.</p>
        ) : (
          <div className="ui-table-wrap">
            <table className="ui-table" data-testid="reliability-slo-table">
              <thead>
                <tr>
                  <th scope="col">Nom</th>
                  <th scope="col">Objectif</th>
                  <th scope="col">Fenêtre</th>
                  <th scope="col">Disponibilité</th>
                  <th scope="col">Budget restant</th>
                  <th scope="col">État</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {slos.map((slo) => {
                  const evaluation = evaluationBySloId.get(slo.id);
                  const computation = evaluation?.computation;
                  const met =
                    computation?.availabilityBasisPoints === null ||
                    computation?.availabilityBasisPoints === undefined
                      ? null
                      : computation.availabilityBasisPoints >= slo.objectiveBasisPoints;
                  return (
                    <SloRow
                      key={slo.id}
                      slo={slo}
                      serviceKey={serviceKey}
                      evaluation={evaluation}
                      met={met}
                      canManage={canManageSlo}
                      pending={pending}
                      onRefresh={() => router.refresh()}
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
            style={{ marginTop: "1rem" }}
            onSubmit={(event) => {
              event.preventDefault();
              const objectiveBasisPoints = parseObjectivePercent(createObjective);
              if (!objectiveBasisPoints) {
                setError("Objectif invalide (90.000 % à 99.999 %).");
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

      <section className="ui-card ui-form-card" data-testid="reliability-burn-section">
        <h2 className="ui-section-title">Burn-rate & alertes SLO</h2>
        <p className="ui-muted">
          Fenêtres fermées 1h / 6h / 24h / 3d. Les politiques d’alerte sont désactivées par défaut.
        </p>
        {slos.length === 0 ? (
          <p>Créez un objectif SLO pour évaluer le burn-rate.</p>
        ) : (
          <div style={{ display: "grid", gap: "1rem" }}>
            {slos.map((slo) => (
              <BurnAlertCard
                key={`burn-${slo.id}`}
                slo={slo}
                serviceKey={serviceKey}
                bundle={burnBySloId[slo.id] ?? null}
                canManage={canManageSlo}
                pending={pending}
                onError={setError}
                onInfo={setInfo}
                onRefresh={() => router.refresh()}
                run={run}
              />
            ))}
          </div>
        )}
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

function BurnAlertCard({
  slo,
  serviceKey,
  bundle,
  canManage,
  pending,
  onError,
  onInfo,
  onRefresh,
  run,
}: {
  slo: ServiceSlo;
  serviceKey: string;
  bundle: SloBurnBundle | null;
  canManage: boolean;
  pending: boolean;
  onError: (message: string | null) => void;
  onInfo: (message: string | null) => void;
  onRefresh: () => void;
  run: (action: () => Promise<void>) => void;
}) {
  const evaluation = bundle?.evaluation ?? null;
  const policy = bundle?.policy ?? null;
  const runtime = bundle?.runtime ?? null;
  const state = evaluation?.state ?? "insufficient-data";
  const budget =
    evaluation?.pairs.fast.short.budgetRemainingFraction ??
    evaluation?.pairs.slow.short.budgetRemainingFraction ??
    null;

  const [warning, setWarning] = useState(String(policy?.warningThreshold ?? 1));
  const [critical, setCritical] = useState(String(policy?.criticalThreshold ?? 14.4));
  const [cooldown, setCooldown] = useState(String(policy?.cooldownSeconds ?? 3600));
  const [notifyRecovery, setNotifyRecovery] = useState(policy?.notifyOnRecovery ?? true);
  const [enabled, setEnabled] = useState(policy?.enabled ?? false);

  return (
    <article
      className="ui-card"
      style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}
      data-testid={`reliability-burn-card-${slo.id}`}
      aria-labelledby={`burn-title-${slo.id}`}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        <h3 id={`burn-title-${slo.id}`} className="ui-section-title" style={{ margin: 0 }}>
          {slo.name}
        </h3>
        <Badge tone={burnStateTone(state)}>
          <span className="sr-only">État burn-rate : </span>
          {BURN_STATE_LABELS[state]}
        </Badge>
        <span className="ui-muted">Objectif {formatBasisPoints(slo.objectiveBasisPoints)}</span>
      </div>

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
          gap: "0.75rem",
          margin: 0,
        }}
      >
        <div>
          <dt className="ui-muted">Burn (fast)</dt>
          <dd data-testid={`reliability-burn-fast-${slo.id}`}>
            {formatBurnRate(evaluation?.pairs.fast.burnRate ?? null)} ·{" "}
            {BURN_STATE_LABELS[evaluation?.pairs.fast.state ?? "insufficient-data"]}
          </dd>
        </div>
        <div>
          <dt className="ui-muted">Burn (slow)</dt>
          <dd data-testid={`reliability-burn-slow-${slo.id}`}>
            {formatBurnRate(evaluation?.pairs.slow.burnRate ?? null)} ·{" "}
            {BURN_STATE_LABELS[evaluation?.pairs.slow.state ?? "insufficient-data"]}
          </dd>
        </div>
        <div>
          <dt className="ui-muted">Fenêtre courte / longue</dt>
          <dd>fast 1h∧6h · slow 24h∧3d</dd>
        </div>
        <div>
          <dt className="ui-muted">Budget restant (fenêtre courte)</dt>
          <dd data-testid={`reliability-burn-budget-${slo.id}`}>{formatBudgetRemaining(budget)}</dd>
        </div>
        <div>
          <dt className="ui-muted">Dernière transition</dt>
          <dd>{formatUtcDateTime(runtime?.lastTransitionAt ?? null)}</dd>
        </div>
        <div>
          <dt className="ui-muted">Dernière notification</dt>
          <dd>
            {runtime?.lastNotifiedState
              ? `${BURN_STATE_LABELS[runtime.lastNotifiedState]} · ${formatUtcDateTime(runtime.lastNotifiedAt)}`
              : "—"}
          </dd>
        </div>
      </dl>

      {!policy ? (
        canManage ? (
          <Button
            type="button"
            disabled={pending}
            data-testid={`reliability-alert-create-${slo.id}`}
            onClick={() =>
              run(async () => {
                const result = await createAlertPolicyAction({
                  sloId: slo.id,
                  serviceKey,
                  enabled: false,
                });
                if (!result.ok) {
                  onError(result.message);
                  return;
                }
                onInfo("Politique d’alerte créée (désactivée).");
                onRefresh();
              })
            }
          >
            Créer une politique d’alerte (désactivée)
          </Button>
        ) : (
          <p className="ui-muted">Aucune politique d’alerte.</p>
        )
      ) : (
        <form
          className="ui-form"
          data-testid={`reliability-alert-form-${slo.id}`}
          onSubmit={(event) => {
            event.preventDefault();
            const warningThreshold = Number.parseFloat(warning.replace(",", "."));
            const criticalThreshold = Number.parseFloat(critical.replace(",", "."));
            const cooldownSeconds = Number.parseInt(cooldown, 10);
            if (
              !(warningThreshold > 0) ||
              !(criticalThreshold > warningThreshold) ||
              !Number.isInteger(cooldownSeconds) ||
              cooldownSeconds < 60
            ) {
              onError("Seuils ou cooldown invalides.");
              return;
            }
            run(async () => {
              const result = await updateAlertPolicyAction({
                id: policy.id,
                expectedConfigRevision: policy.configRevision,
                serviceKey,
                enabled,
                warningThreshold,
                criticalThreshold,
                cooldownSeconds,
                notifyOnRecovery: notifyRecovery,
              });
              if (!result.ok) {
                onError(result.message);
                return;
              }
              onInfo("Politique d’alerte mise à jour.");
              onRefresh();
            });
          }}
        >
          <p data-testid={`reliability-alert-status-label-${slo.id}`}>
            Politique : {enabled ? "activée" : "désactivée"}
          </p>
          <label className="ui-field ui-checkbox">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              data-testid={`reliability-alert-enabled-${slo.id}`}
              disabled={!canManage || pending}
            />
            Activer les alertes burn-rate
          </label>
          <Field label="Seuil warning (×)">
            <Input
              value={warning}
              onChange={(event) => setWarning(event.target.value)}
              data-testid={`reliability-alert-warning-${slo.id}`}
              disabled={!canManage || pending}
            />
          </Field>
          <Field label="Seuil critical (×)">
            <Input
              value={critical}
              onChange={(event) => setCritical(event.target.value)}
              data-testid={`reliability-alert-critical-${slo.id}`}
              disabled={!canManage || pending}
            />
          </Field>
          <Field label="Cooldown (secondes)">
            <Input
              value={cooldown}
              onChange={(event) => setCooldown(event.target.value)}
              data-testid={`reliability-alert-cooldown-${slo.id}`}
              disabled={!canManage || pending}
            />
          </Field>
          <label className="ui-field ui-checkbox">
            <input
              type="checkbox"
              checked={notifyRecovery}
              onChange={(event) => setNotifyRecovery(event.target.checked)}
              disabled={!canManage || pending}
            />
            Notifier la recovery
          </label>
          {canManage ? (
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <Button
                type="submit"
                disabled={pending}
                data-testid={`reliability-alert-save-${slo.id}`}
              >
                Enregistrer la politique
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                data-testid={`reliability-alert-delete-${slo.id}`}
                onClick={() =>
                  run(async () => {
                    const result = await deleteAlertPolicyAction({
                      id: policy.id,
                      expectedConfigRevision: policy.configRevision,
                      serviceKey,
                    });
                    if (!result.ok) {
                      onError(result.message);
                      return;
                    }
                    onInfo("Politique d’alerte supprimée.");
                    onRefresh();
                  })
                }
              >
                Supprimer
              </Button>
            </div>
          ) : null}
        </form>
      )}
    </article>
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
  onRefresh,
}: {
  slo: ServiceSlo;
  serviceKey: string;
  evaluation: SloEvaluation | undefined;
  met: boolean | null;
  canManage: boolean;
  pending: boolean;
  onError: (message: string | null) => void;
  onInfo: (message: string | null) => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const computation = evaluation?.computation;
  return (
    <tr data-testid={`reliability-slo-row-${slo.id}`}>
      <td>{slo.name}</td>
      <td>{formatBasisPoints(slo.objectiveBasisPoints)}</td>
      <td>{SLO_WINDOW_LABELS[slo.windowDays]}</td>
      <td>{formatBasisPoints(computation?.availabilityBasisPoints ?? null)}</td>
      <td>{formatBasisPoints(computation?.remainingBudgetBasisPoints ?? null)}</td>
      <td>
        <Badge tone={sloStatusTone(met)}>
          <span className="sr-only">État SLO : </span>
          {sloStatusLabel(met)}
        </Badge>
      </td>
      <td>
        {canManage ? (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                void updateSloAction({
                  id: slo.id,
                  expectedConfigRevision: slo.configRevision,
                  enabled: !slo.enabled,
                  serviceKey,
                }).then((result) => {
                  if (!result.ok) {
                    onError(result.message);
                    return;
                  }
                  onInfo(slo.enabled ? "SLO désactivé." : "SLO activé.");
                  onRefresh();
                });
              }}
            >
              {slo.enabled ? "Désactiver" : "Activer"}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={onDelete}>
              Supprimer
            </Button>
          </div>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}
