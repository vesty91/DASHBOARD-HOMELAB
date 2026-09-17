"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, ConfirmDialog, Field, Select } from "@dashboard/ui";
import type { ActualStatus, ImpactStatus } from "@dashboard/topology";
import { createDependencyAction, deleteDependencyAction } from "./actions";
import {
  ACTUAL_STATUS_LABELS,
  IMPACT_STATUS_LABELS,
  TOPOLOGY_UI_MAX_EDGES,
  TOPOLOGY_UI_MAX_SERVICES,
  actualStatusTone,
  impactStatusTone,
} from "./labels";

export type TopologyServiceOption = {
  id: string;
  label: string;
};

export type TopologyDependencyRow = {
  id: string;
  upstreamServiceKey: string;
  downstreamServiceKey: string;
  relationship: "depends_on";
};

export type TopologyServiceImpactRow = {
  serviceKey: string;
  actualStatus: ActualStatus;
  impactStatus: ImpactStatus;
};

export function TopologyPanel({
  services,
  dependencies,
  impactServices,
  candidateRootCause,
  truncated,
  canManage,
}: {
  services: TopologyServiceOption[];
  dependencies: TopologyDependencyRow[];
  impactServices: TopologyServiceImpactRow[];
  candidateRootCause: string | null;
  truncated: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [upstream, setUpstream] = useState("");
  const [downstream, setDownstream] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const labelById = useMemo(() => {
    const map = new Map(services.map((service) => [service.id, service.label]));
    return map;
  }, [services]);

  const labelFor = (id: string) => labelById.get(id) ?? "Service";

  const boundedImpact = impactServices.slice(0, TOPOLOGY_UI_MAX_SERVICES);
  const boundedDeps = dependencies.slice(0, TOPOLOGY_UI_MAX_EDGES);
  const overflow =
    impactServices.length > TOPOLOGY_UI_MAX_SERVICES ||
    dependencies.length > TOPOLOGY_UI_MAX_EDGES ||
    truncated;

  const impactByKey = useMemo(() => {
    const map = new Map<string, TopologyServiceImpactRow>();
    for (const row of boundedImpact) map.set(row.serviceKey, row);
    return map;
  }, [boundedImpact]);

  function run(action: () => Promise<void>) {
    startTransition(() => {
      void action();
    });
  }

  return (
    <div className="ui-stack topology-panel" style={{ display: "grid", gap: "1.25rem" }}>
      {error ? (
        <Alert tone="danger" data-testid="topology-error">
          {error}
        </Alert>
      ) : null}
      {info ? (
        <Alert tone="success" data-testid="topology-info">
          {info}
        </Alert>
      ) : null}
      {overflow ? (
        <Alert tone="warning" data-testid="topology-truncated">
          Affichage borné ({TOPOLOGY_UI_MAX_SERVICES} services / {TOPOLOGY_UI_MAX_EDGES} arêtes).
          Affinez le graphe ou réduisez les dépendances.
        </Alert>
      ) : null}

      <section className="ui-card ui-form-card" aria-labelledby="topology-impact-heading">
        <h2 id="topology-impact-heading" className="ui-section-title">
          Impact
        </h2>
        <p className="ui-muted">
          L’état réel et l’impact topologique sont séparés. Le candidat de cause racine est une
          heuristique, jamais une affirmation définitive.
        </p>
        {candidateRootCause ? (
          <p data-testid="topology-candidate-root-cause">
            Candidat de cause racine : <strong>{labelFor(candidateRootCause)}</strong>
          </p>
        ) : (
          <p data-testid="topology-candidate-root-cause-none">Aucun candidat de cause racine.</p>
        )}
        {boundedImpact.length === 0 ? (
          <p data-testid="topology-services-empty">Aucun service dans le graphe.</p>
        ) : (
          <div className="ui-table-wrap">
            <table className="ui-table" data-testid="topology-services-table">
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col">État réel</th>
                  <th scope="col">Impact</th>
                </tr>
              </thead>
              <tbody>
                {boundedImpact.map((row) => (
                  <tr key={row.serviceKey} data-testid={`topology-service-${row.serviceKey}`}>
                    <td>
                      {labelFor(row.serviceKey)}
                      {candidateRootCause === row.serviceKey ? (
                        <span className="topology-root-marker"> (candidat)</span>
                      ) : null}
                    </td>
                    <td>
                      <Badge tone={actualStatusTone(row.actualStatus)}>
                        <span data-testid={`topology-actual-label-${row.serviceKey}`}>
                          {ACTUAL_STATUS_LABELS[row.actualStatus]}
                        </span>
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={impactStatusTone(row.impactStatus)}>
                        <span data-testid={`topology-impact-label-${row.serviceKey}`}>
                          {IMPACT_STATUS_LABELS[row.impactStatus]}
                        </span>
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ui-card ui-form-card" aria-labelledby="topology-edges-heading">
        <h2 id="topology-edges-heading" className="ui-section-title">
          Dépendances
        </h2>
        <p className="ui-muted">
          Relation fermée <code>depends_on</code> : le service aval dépend du service amont.
        </p>
        {boundedDeps.length === 0 ? (
          <p data-testid="topology-edges-empty">Aucune dépendance configurée.</p>
        ) : (
          <div className="ui-table-wrap">
            <table className="ui-table" data-testid="topology-edges-table">
              <thead>
                <tr>
                  <th scope="col">Amont</th>
                  <th scope="col">Relation</th>
                  <th scope="col">Aval</th>
                  {canManage ? <th scope="col">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {boundedDeps.map((edge) => (
                  <tr key={edge.id} data-testid={`topology-edge-${edge.id}`}>
                    <td>{labelFor(edge.upstreamServiceKey)}</td>
                    <td>
                      <code>depends_on</code>
                    </td>
                    <td>{labelFor(edge.downstreamServiceKey)}</td>
                    {canManage ? (
                      <td>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pending}
                          data-testid={`topology-edge-delete-${edge.id}`}
                          onClick={() => setConfirmDeleteId(edge.id)}
                        >
                          Supprimer
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 className="topology-list-title" id="topology-graph-list-heading">
          Vue liste (accessible)
        </h3>
        <ol
          className="topology-edge-list"
          aria-labelledby="topology-graph-list-heading"
          data-testid="topology-edge-list"
        >
          {boundedDeps.length === 0 ? (
            <li>Aucune arête.</li>
          ) : (
            boundedDeps.map((edge) => {
              const upImpact = impactByKey.get(edge.upstreamServiceKey);
              const downImpact = impactByKey.get(edge.downstreamServiceKey);
              return (
                <li key={edge.id}>
                  {labelFor(edge.upstreamServiceKey)}
                  {upImpact
                    ? ` [${ACTUAL_STATUS_LABELS[upImpact.actualStatus]} / ${IMPACT_STATUS_LABELS[upImpact.impactStatus]}]`
                    : ""}{" "}
                  → depends_on → {labelFor(edge.downstreamServiceKey)}
                  {downImpact
                    ? ` [${ACTUAL_STATUS_LABELS[downImpact.actualStatus]} / ${IMPACT_STATUS_LABELS[downImpact.impactStatus]}]`
                    : ""}
                </li>
              );
            })
          )}
        </ol>
      </section>

      {canManage ? (
        <section className="ui-card ui-form-card" aria-labelledby="topology-create-heading">
          <h2 id="topology-create-heading" className="ui-section-title">
            Ajouter une dépendance
          </h2>
          <form
            className="ui-form ui-form-grid"
            data-testid="topology-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              setInfo(null);
              if (!upstream || !downstream) {
                setError("Sélectionnez un service amont et un service aval.");
                return;
              }
              if (upstream === downstream) {
                setError("Une dépendance vers soi-même est refusée.");
                return;
              }
              run(async () => {
                const result = await createDependencyAction({
                  upstreamServiceKey: upstream,
                  downstreamServiceKey: downstream,
                });
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setInfo("Dépendance créée.");
                setUpstream("");
                setDownstream("");
                router.refresh();
              });
            }}
          >
            <Field label="Service amont">
              <Select
                value={upstream}
                onChange={(event) => setUpstream(event.target.value)}
                data-testid="topology-create-upstream"
                required
              >
                <option value="">Choisir…</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Service aval">
              <Select
                value={downstream}
                onChange={(event) => setDownstream(event.target.value)}
                data-testid="topology-create-downstream"
                required
              >
                <option value="">Choisir…</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={pending} data-testid="topology-create-submit">
              Créer la dépendance
            </Button>
          </form>
        </section>
      ) : null}

      {confirmDeleteId ? (
        <ConfirmDialog
          title="Supprimer la dépendance ?"
          confirmLabel="Supprimer"
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => {
            const id = confirmDeleteId;
            setConfirmDeleteId(null);
            if (!id) return;
            setError(null);
            setInfo(null);
            run(async () => {
              const result = await deleteDependencyAction(id);
              if (!result.ok) {
                setError(result.message);
                return;
              }
              setInfo("Dépendance supprimée.");
              router.refresh();
            });
          }}
        >
          <p>
            Cette action retire uniquement le lien topologique. Les états réels des services ne sont
            pas modifiés.
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
