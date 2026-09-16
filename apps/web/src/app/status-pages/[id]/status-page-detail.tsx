"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, Badge, Button, ConfirmDialog, Field, Input, Select, Textarea } from "@dashboard/ui";
import type { MaintenanceWindowDto, ManagedStatusPageDto } from "@dashboard/status-pages";
import {
  cancelMaintenanceAction,
  deleteStatusPageAction,
  replaceStatusPageServicesAction,
  scheduleMaintenanceAction,
  updateStatusPageAction,
} from "../actions";
import {
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_STATUS_TONES,
  PUBLIC_STATUS_LABELS,
  PUBLIC_STATUS_TONES,
  VISIBILITY_LABELS,
  formatStatusTime,
  utcLocalInputToIso,
} from "../labels";

type IntegrationOption = { id: string; name: string; type: string };

type ServiceDraft = {
  key: string;
  sourceIntegrationId: string;
  displayName: string;
  description: string;
  sortOrder: number;
  showIncidentHistory: boolean;
};

function toDrafts(page: ManagedStatusPageDto): ServiceDraft[] {
  return page.services
    .map((service) => ({
      key: service.id,
      sourceIntegrationId: service.sourceIntegrationId,
      displayName: service.displayName,
      description: service.description ?? "",
      sortOrder: service.sortOrder,
      showIncidentHistory: service.showIncidentHistory,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName));
}

function preferredMaintenanceIntegrationId(
  page: ManagedStatusPageDto,
  integrations: IntegrationOption[],
  current: string,
): string {
  const pageIds = page.services.map((service) => service.sourceIntegrationId);
  if (pageIds.length > 0) {
    if (current && pageIds.includes(current)) return current;
    return pageIds[0] ?? "";
  }
  if (current && integrations.some((item) => item.id === current)) return current;
  return integrations[0]?.id ?? "";
}

export function StatusPageDetail({
  page,
  integrations,
  maintenances,
  canManage,
}: {
  page: ManagedStatusPageDto;
  integrations: IntegrationOption[];
  maintenances: MaintenanceWindowDto[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [revision, setRevision] = useState(page.configRevision);
  const [name, setName] = useState(page.name);
  const [slug, setSlug] = useState(page.slug);
  const [description, setDescription] = useState(page.description ?? "");
  const [enabled, setEnabled] = useState(page.enabled);
  const [visibility, setVisibility] = useState(page.visibility);
  const [services, setServices] = useState<ServiceDraft[]>(() => toDrafts(page));
  const [maintenanceName, setMaintenanceName] = useState("");
  const [maintenanceDescription, setMaintenanceDescription] = useState("");
  const [maintenanceStartsAt, setMaintenanceStartsAt] = useState("");
  const [maintenanceEndsAt, setMaintenanceEndsAt] = useState("");
  const [maintenanceIntegrationId, setMaintenanceIntegrationId] = useState(() =>
    preferredMaintenanceIntegrationId(page, integrations, ""),
  );

  useEffect(() => {
    setMaintenanceIntegrationId((current) =>
      preferredMaintenanceIntegrationId(page, integrations, current),
    );
  }, [page, integrations]);

  const relatedMaintenances = useMemo(() => {
    const ids = new Set(page.services.map((service) => service.sourceIntegrationId));
    return maintenances.filter((item) => item.integrationIds.some((id) => ids.has(id)));
  }, [maintenances, page.services]);

  function run(action: () => Promise<void>) {
    startTransition(() => {
      void action();
    });
  }

  const published = visibility === "public" && enabled;

  return (
    <div className="ui-stack status-page-detail" style={{ display: "grid", gap: "1.25rem" }}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {info ? <Alert tone="success">{info}</Alert> : null}

      <section className="ui-card ui-form-card">
        <h2 className="ui-section-title">Résumé</h2>
        <dl className="status-page-summary">
          <div>
            <dt>Statut global</dt>
            <dd>
              <Badge tone={PUBLIC_STATUS_TONES[page.overallStatus]}>
                {PUBLIC_STATUS_LABELS[page.overallStatus]}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>Visibilité</dt>
            <dd>{VISIBILITY_LABELS[visibility]}</dd>
          </div>
          <div>
            <dt>Activation</dt>
            <dd>{enabled ? "Activée" : "Désactivée"}</dd>
          </div>
          <div>
            <dt>Publication</dt>
            <dd>{published ? "Publiée" : "Non publiée"}</dd>
          </div>
          <div>
            <dt>Révision</dt>
            <dd>{revision}</dd>
          </div>
          <div>
            <dt>URL publique</dt>
            <dd>
              {published ? (
                <Link href={`/status/${slug}`} data-testid="status-page-public-link">
                  /status/{slug}
                </Link>
              ) : (
                <span className="ui-muted">
                  Indisponible tant que la page n’est pas publique et activée
                </span>
              )}
            </dd>
          </div>
        </dl>
        {canManage ? (
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
            <Button
              type="button"
              disabled={pending || published}
              data-testid="status-page-publish"
              onClick={() =>
                run(async () => {
                  setError(null);
                  setInfo(null);
                  const result = await updateStatusPageAction({
                    id: page.id,
                    expectedConfigRevision: revision,
                    name: name.trim(),
                    slug: slug.trim(),
                    description: description.trim(),
                    visibility: "public",
                    enabled: true,
                  });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setVisibility("public");
                  setEnabled(true);
                  setRevision((value) => value + 1);
                  setInfo("Status page publiée.");
                  router.refresh();
                })
              }
            >
              Publier
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || visibility !== "public"}
              data-testid="status-page-unpublish"
              onClick={() =>
                run(async () => {
                  setError(null);
                  setInfo(null);
                  const result = await updateStatusPageAction({
                    id: page.id,
                    expectedConfigRevision: revision,
                    name: name.trim(),
                    slug: slug.trim(),
                    description: description.trim(),
                    visibility: "private",
                    enabled,
                  });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setVisibility("private");
                  setRevision((value) => value + 1);
                  setInfo("Status page dépubliée.");
                  router.refresh();
                })
              }
            >
              Dépublier
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() => setConfirmDelete(true)}
            >
              Supprimer
            </Button>
          </div>
        ) : null}
      </section>

      {canManage ? (
        <section className="ui-form ui-card ui-form-card ui-form-grid">
          <h2 className="ui-section-title">Paramètres</h2>
          <Field label="Nom">
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
          </Field>
          <Field label="Slug">
            <Input
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              maxLength={64}
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={1000}
            />
          </Field>
          <Field label="Activée">
            <Select
              value={enabled ? "true" : "false"}
              onChange={(event) => setEnabled(event.target.value === "true")}
            >
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </Select>
          </Field>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                setError(null);
                setInfo(null);
                const result = await updateStatusPageAction({
                  id: page.id,
                  expectedConfigRevision: revision,
                  name: name.trim(),
                  slug: slug.trim(),
                  description: description.trim(),
                  visibility,
                  enabled,
                });
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setRevision((value) => value + 1);
                setInfo("Paramètres enregistrés.");
                router.refresh();
              })
            }
          >
            Enregistrer les paramètres
          </Button>
        </section>
      ) : null}

      <section className="ui-card ui-form-card">
        <h2 className="ui-section-title">Services</h2>
        {canManage ? (
          <>
            <div className="status-page-services" data-testid="status-page-services-editor">
              {services.map((service, index) => (
                <div key={service.key} className="status-page-service-row">
                  <Field label="Intégration source">
                    <Select
                      value={service.sourceIntegrationId}
                      onChange={(event) => {
                        const next = [...services];
                        const current = next[index];
                        if (!current) return;
                        next[index] = { ...current, sourceIntegrationId: event.target.value };
                        setServices(next);
                      }}
                      data-testid={`status-service-integration-${index}`}
                    >
                      {integrations.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.type})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Nom affiché">
                    <Input
                      value={service.displayName}
                      onChange={(event) => {
                        const next = [...services];
                        const current = next[index];
                        if (!current) return;
                        next[index] = { ...current, displayName: event.target.value };
                        setServices(next);
                      }}
                      maxLength={120}
                      data-testid={`status-service-name-${index}`}
                    />
                  </Field>
                  <Field label="Description">
                    <Input
                      value={service.description}
                      onChange={(event) => {
                        const next = [...services];
                        const current = next[index];
                        if (!current) return;
                        next[index] = { ...current, description: event.target.value };
                        setServices(next);
                      }}
                      maxLength={1000}
                    />
                  </Field>
                  <Field label="Ordre">
                    <Input
                      type="number"
                      min={0}
                      max={10000}
                      value={service.sortOrder}
                      onChange={(event) => {
                        const next = [...services];
                        const current = next[index];
                        if (!current) return;
                        next[index] = {
                          ...current,
                          sortOrder: Number(event.target.value) || 0,
                        };
                        setServices(next);
                      }}
                    />
                  </Field>
                  <label className="status-page-checkbox">
                    <input
                      type="checkbox"
                      checked={service.showIncidentHistory}
                      onChange={(event) => {
                        const next = [...services];
                        const current = next[index];
                        if (!current) return;
                        next[index] = {
                          ...current,
                          showIncidentHistory: event.target.checked,
                        };
                        setServices(next);
                      }}
                    />
                    Historique d’incidents (public)
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setServices((rows) => rows.filter((_, i) => i !== index))}
                  >
                    Retirer
                  </Button>
                </div>
              ))}
            </div>
            <div
              style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.75rem" }}
            >
              <Button
                type="button"
                variant="secondary"
                disabled={pending || integrations.length === 0}
                data-testid="status-page-add-service"
                onClick={() => {
                  const first = integrations[0];
                  if (!first) return;
                  setServices((rows) => [
                    ...rows,
                    {
                      key: `draft-${Date.now()}-${rows.length}`,
                      sourceIntegrationId: first.id,
                      displayName: first.name,
                      description: "",
                      sortOrder: rows.length,
                      showIncidentHistory: true,
                    },
                  ]);
                }}
              >
                Ajouter un service
              </Button>
              <Button
                type="button"
                disabled={pending}
                data-testid="status-page-save-services"
                onClick={() =>
                  run(async () => {
                    setError(null);
                    setInfo(null);
                    if (
                      services.some((row) => !row.sourceIntegrationId || !row.displayName.trim())
                    ) {
                      setError("Chaque service doit avoir une intégration et un nom affiché.");
                      return;
                    }
                    const result = await replaceStatusPageServicesAction({
                      statusPageId: page.id,
                      expectedConfigRevision: revision,
                      services: services.map((row) => ({
                        sourceIntegrationId: row.sourceIntegrationId,
                        displayName: row.displayName.trim(),
                        description: row.description.trim(),
                        sortOrder: row.sortOrder,
                        showIncidentHistory: row.showIncidentHistory,
                      })),
                    });
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    setRevision((value) => value + 1);
                    setInfo("Services enregistrés.");
                    router.refresh();
                  })
                }
              >
                Enregistrer les services
              </Button>
            </div>
          </>
        ) : (
          <ul className="status-page-service-list" aria-label="Services">
            {page.services.map((service) => (
              <li key={service.id}>
                <strong>{service.displayName}</strong>
                <Badge tone={PUBLIC_STATUS_TONES[service.status]}>
                  {PUBLIC_STATUS_LABELS[service.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ui-card ui-form-card" data-testid="status-page-maintenance">
        <h2 className="ui-section-title">Maintenance</h2>
        {relatedMaintenances.length === 0 ? (
          <p className="ui-muted">Aucune fenêtre de maintenance liée aux services de cette page.</p>
        ) : (
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">Nom</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Début (UTC)</th>
                  <th scope="col">Fin (UTC)</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {relatedMaintenances.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/status-pages/maintenance/${item.id}`}>{item.name}</Link>
                    </td>
                    <td>
                      <Badge tone={MAINTENANCE_STATUS_TONES[item.status]}>
                        {MAINTENANCE_STATUS_LABELS[item.status]}
                      </Badge>
                    </td>
                    <td>{formatStatusTime(item.startsAt)}</td>
                    <td>{formatStatusTime(item.endsAt)}</td>
                    <td>
                      {canManage && (item.status === "scheduled" || item.status === "active") ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pending}
                          data-testid={`status-maintenance-cancel-${item.id}`}
                          onClick={() =>
                            run(async () => {
                              setError(null);
                              setInfo(null);
                              const result = await cancelMaintenanceAction(item.id);
                              if (!result.ok) {
                                setError(result.message);
                                return;
                              }
                              setInfo("Maintenance annulée.");
                              router.refresh();
                            })
                          }
                        >
                          Annuler
                        </Button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canManage ? (
          <div className="ui-form ui-form-grid" style={{ marginTop: "1rem" }}>
            <h3 className="ui-section-title">Planifier une maintenance</h3>
            <p className="ui-muted">Les horaires sont saisis en UTC.</p>
            <Field label="Nom">
              <Input
                value={maintenanceName}
                onChange={(event) => setMaintenanceName(event.target.value)}
                maxLength={120}
                data-testid="status-maintenance-name"
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={maintenanceDescription}
                onChange={(event) => setMaintenanceDescription(event.target.value)}
                maxLength={1000}
              />
            </Field>
            <Field label="Début (UTC)">
              <Input
                type="datetime-local"
                value={maintenanceStartsAt}
                onChange={(event) => setMaintenanceStartsAt(event.target.value)}
                data-testid="status-maintenance-starts"
              />
            </Field>
            <Field label="Fin (UTC)">
              <Input
                type="datetime-local"
                value={maintenanceEndsAt}
                onChange={(event) => setMaintenanceEndsAt(event.target.value)}
                data-testid="status-maintenance-ends"
              />
            </Field>
            <Field label="Intégration cible">
              <Select
                value={maintenanceIntegrationId}
                onChange={(event) => setMaintenanceIntegrationId(event.target.value)}
                data-testid="status-maintenance-integration"
              >
                {(page.services.length > 0
                  ? page.services.map((service) => ({
                      id: service.sourceIntegrationId,
                      label: service.displayName,
                    }))
                  : integrations.map((item) => ({
                      id: item.id,
                      label: `${item.name} (${item.type})`,
                    }))
                ).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              type="button"
              disabled={pending}
              data-testid="status-maintenance-schedule"
              onClick={() =>
                run(async () => {
                  setError(null);
                  setInfo(null);
                  try {
                    if (!maintenanceIntegrationId) {
                      setError("Sélectionnez une intégration cible.");
                      return;
                    }
                    const result = await scheduleMaintenanceAction({
                      name: maintenanceName.trim(),
                      description: maintenanceDescription.trim(),
                      startsAt: new Date(utcLocalInputToIso(maintenanceStartsAt)),
                      endsAt: new Date(utcLocalInputToIso(maintenanceEndsAt)),
                      integrationIds: [maintenanceIntegrationId],
                    });
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    setMaintenanceName("");
                    setMaintenanceDescription("");
                    setMaintenanceStartsAt("");
                    setMaintenanceEndsAt("");
                    setInfo("Maintenance planifiée.");
                    router.refresh();
                  } catch (scheduleError) {
                    setError(
                      scheduleError instanceof Error
                        ? scheduleError.message
                        : "Horaires de maintenance invalides.",
                    );
                  }
                })
              }
            >
              Planifier
            </Button>
          </div>
        ) : null}
      </section>

      {confirmDelete ? (
        <ConfirmDialog
          title="Supprimer la status page ?"
          confirmLabel="Supprimer"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            run(async () => {
              setConfirmDelete(false);
              setError(null);
              const result = await deleteStatusPageAction({
                id: page.id,
                expectedConfigRevision: revision,
                slug: page.slug,
              });
              if (!result.ok) {
                setError(result.message);
                return;
              }
              router.push("/status-pages");
              router.refresh();
            })
          }
        >
          <p>Cette action est irréversible. La page publique disparaîtra immédiatement.</p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
