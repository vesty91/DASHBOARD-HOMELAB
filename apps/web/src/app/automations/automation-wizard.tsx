"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, Select } from "@dashboard/ui";
import type {
  AutomationActionPolicy,
  AutomationActionType,
  AutomationTriggerType,
} from "@dashboard/automations/browser";
import {
  AUTOMATION_EVENT_TYPES,
  AUTOMATION_STATUS_VALUES,
  CONDITION_COMPARE_OPS,
  CONDITION_FIELDS,
} from "@dashboard/automations/browser";
import { createAutomationAction } from "./actions";
import { TRIGGER_LABELS } from "./automation-labels";

const STEPS = [
  "Général",
  "Déclencheur",
  "Conditions",
  "Action",
  "Cooldown",
  "Revue",
  "Enregistrer",
] as const;

type IntegrationOption = { id: string; name: string; type: string };

type WizardProps = {
  actions: AutomationActionPolicy[];
  integrations: IntegrationOption[];
};

type ScheduleKind = "interval" | "cron";

function buildTriggerConfig(state: {
  triggerType: AutomationTriggerType;
  scheduleKind: ScheduleKind;
  everyMinutes: number;
  cronExpression: string;
  eventType: (typeof AUTOMATION_EVENT_TYPES)[number];
  fromStatus: "*" | (typeof AUTOMATION_STATUS_VALUES)[number];
  toStatus: "*" | (typeof AUTOMATION_STATUS_VALUES)[number];
  forDurationSeconds: number;
  filterIntegrationId: string;
  filterIntegrationType: string;
}): Record<string, unknown> {
  switch (state.triggerType) {
    case "schedule":
      if (state.scheduleKind === "cron")
        return { kind: "cron", expression: state.cronExpression.trim(), timezone: "UTC" };
      return { kind: "interval", everyMinutes: state.everyMinutes };
    case "event": {
      const config: Record<string, unknown> = { eventType: state.eventType };
      if (state.filterIntegrationId.trim()) config.integrationId = state.filterIntegrationId.trim();
      if (state.filterIntegrationType.trim())
        config.integrationType = state.filterIntegrationType.trim();
      return config;
    }
    case "status-transition": {
      const config: Record<string, unknown> = {
        from: state.fromStatus,
        to: state.toStatus,
      };
      if (state.filterIntegrationId.trim()) config.integrationId = state.filterIntegrationId.trim();
      if (state.filterIntegrationType.trim())
        config.integrationType = state.filterIntegrationType.trim();
      if (state.forDurationSeconds > 0) config.forDurationSeconds = state.forDurationSeconds;
      return config;
    }
    default: {
      const _never: never = state.triggerType;
      return _never;
    }
  }
}

function buildConditionConfig(state: {
  conditionEnabled: boolean;
  conditionField: (typeof CONDITION_FIELDS)[number];
  conditionOp: (typeof CONDITION_COMPARE_OPS)[number];
  conditionValue: string;
}): Record<string, unknown> | null {
  if (!state.conditionEnabled) return null;
  const raw = state.conditionValue.trim();
  let value: string | number | boolean = raw;
  if (raw === "true") value = true;
  else if (raw === "false") value = false;
  else if (/^-?\d+(\.\d+)?$/u.test(raw)) value = Number(raw);
  return {
    op: state.conditionOp,
    field: state.conditionField,
    value,
  };
}

function buildActionConfig(state: {
  actionType: AutomationActionType;
  integrationId: string;
  topic: string;
  message: string;
  title: string;
  priority: "min" | "low" | "default" | "high" | "max";
  tags: string;
  hashes: string;
  seriesId: string;
  episodeId: string;
  movieId: string;
}): Record<string, unknown> {
  const integrationId = state.integrationId.trim();
  switch (state.actionType) {
    case "ntfy.publish": {
      const tags = state.tags
        .split(/[\s,]+/u)
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 5);
      const config: Record<string, unknown> = {
        integrationId,
        topic: state.topic.trim(),
        message: state.message.trim(),
        priority: state.priority,
      };
      if (state.title.trim()) config.title = state.title.trim();
      if (tags.length > 0) config.tags = tags;
      return config;
    }
    case "qbittorrent.pause":
    case "qbittorrent.resume":
      return {
        integrationId,
        hashes: state.hashes
          .split(/[\s,]+/u)
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 8),
      };
    case "sonarr.refresh-series":
      return { integrationId, seriesId: Number(state.seriesId) };
    case "sonarr.search-episode":
      return { integrationId, episodeId: Number(state.episodeId) };
    case "radarr.refresh-movie":
    case "radarr.search-movie":
      return { integrationId, movieId: Number(state.movieId) };
    case "proxmox.start":
    case "proxmox.shutdown":
    case "proxmox.reboot":
    case "seerr.approve":
    case "seerr.decline":
      return { integrationId };
    default: {
      const _never: never = state.actionType;
      return _never;
    }
  }
}

export function AutomationWizard({ actions, integrations }: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>("schedule");
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("interval");
  const [everyMinutes, setEveryMinutes] = useState(15);
  const [cronExpression, setCronExpression] = useState("0 * * * *");
  const [eventType, setEventType] = useState<(typeof AUTOMATION_EVENT_TYPES)[number]>(
    "integration.status.changed",
  );
  const [fromStatus, setFromStatus] = useState<"*" | (typeof AUTOMATION_STATUS_VALUES)[number]>(
    "available",
  );
  const [toStatus, setToStatus] = useState<"*" | (typeof AUTOMATION_STATUS_VALUES)[number]>(
    "unavailable",
  );
  const [forDurationSeconds, setForDurationSeconds] = useState(60);
  const [filterIntegrationId, setFilterIntegrationId] = useState("");
  const [filterIntegrationType, setFilterIntegrationType] = useState("");

  const [conditionEnabled, setConditionEnabled] = useState(false);
  const [conditionField, setConditionField] = useState<(typeof CONDITION_FIELDS)[number]>("status");
  const [conditionOp, setConditionOp] = useState<(typeof CONDITION_COMPARE_OPS)[number]>("eq");
  const [conditionValue, setConditionValue] = useState("unavailable");

  const [actionType, setActionType] = useState<AutomationActionType>(
    actions[0]?.actionType ?? "ntfy.publish",
  );
  const [integrationId, setIntegrationId] = useState("");
  const [topic, setTopic] = useState("homelab");
  const [message, setMessage] = useState("Service unavailable");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"min" | "low" | "default" | "high" | "max">("default");
  const [tags, setTags] = useState("");
  const [hashes, setHashes] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [movieId, setMovieId] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(300);

  const selectedPolicy = actions.find((action) => action.actionType === actionType);
  const matchingIntegrations = useMemo(() => {
    const expected = selectedPolicy?.expectedIntegrationType;
    if (!expected) return integrations;
    return integrations.filter((item) => item.type === expected);
  }, [integrations, selectedPolicy]);

  function validateStep(current: number): string | null {
    if (current === 0) {
      if (!name.trim()) return "Le nom est obligatoire.";
      if (name.trim().length > 100) return "Le nom est trop long.";
    }
    if (current === 1) {
      if (triggerType === "schedule" && scheduleKind === "interval") {
        if (everyMinutes < 1 || everyMinutes > 1440) return "Intervalle invalide (1–1440 min).";
      }
      if (triggerType === "schedule" && scheduleKind === "cron" && !cronExpression.trim())
        return "Expression cron obligatoire (UTC, 5 champs).";
      if (
        triggerType === "status-transition" &&
        fromStatus !== "*" &&
        toStatus !== "*" &&
        fromStatus === toStatus
      )
        return "Les statuts from et to doivent différer.";
    }
    if (current === 3) {
      if (!selectedPolicy?.automationAllowed) return "Action non autorisée pour les automations.";
      if (!integrationId.trim()) return "Sélectionnez une intégration.";
      if (actionType === "ntfy.publish") {
        if (!topic.trim()) return "Topic ntfy obligatoire.";
        if (!message.trim()) return "Message ntfy obligatoire.";
      }
    }
    if (current === 4) {
      if (cooldownSeconds < 0 || cooldownSeconds > 86_400) return "Cooldown invalide (0–86400).";
    }
    return null;
  }

  function goNext() {
    const messageError = validateStep(step);
    if (messageError) {
      setError(messageError);
      return;
    }
    setError(null);
    setStep((value) => Math.min(STEPS.length - 1, value + 1));
  }

  function goBack() {
    setError(null);
    setStep((value) => Math.max(0, value - 1));
  }

  function onSave() {
    const messageError = validateStep(3) ?? validateStep(0) ?? validateStep(4);
    if (messageError) {
      setError(messageError);
      return;
    }
    setError(null);
    startTransition(() => {
      void (async () => {
        const result = await createAutomationAction({
          name: name.trim(),
          description: description.trim() ? description.trim() : null,
          triggerType,
          triggerConfigJson: buildTriggerConfig({
            triggerType,
            scheduleKind,
            everyMinutes,
            cronExpression,
            eventType,
            fromStatus,
            toStatus,
            forDurationSeconds,
            filterIntegrationId,
            filterIntegrationType,
          }),
          conditionConfigJson: buildConditionConfig({
            conditionEnabled,
            conditionField,
            conditionOp,
            conditionValue,
          }),
          actionType,
          actionConfigJson: buildActionConfig({
            actionType,
            integrationId,
            topic,
            message,
            title,
            priority,
            tags,
            hashes,
            seriesId,
            episodeId,
            movieId,
          }),
          cooldownSeconds,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        router.push(`/automations/${result.id}`);
        router.refresh();
      })();
    });
  }

  return (
    <section className="ui-form ui-card ui-form-card" aria-labelledby="automation-wizard-title">
      <h2 id="automation-wizard-title" className="ui-section-title">
        Étape {step + 1} / {STEPS.length} — {STEPS[step]}
      </h2>
      <ol className="ui-muted" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        {STEPS.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined}>
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {step === 0 ? (
        <div className="ui-form-grid">
          <Field label="Nom">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              autoComplete="off"
            />
          </Field>
          <Field label="Description">
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
              autoComplete="off"
            />
          </Field>
          <Alert tone="info">La règle sera créée désactivée.</Alert>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="ui-form-grid">
          <Field label="Type de déclencheur">
            <Select
              value={triggerType}
              onChange={(event) => setTriggerType(event.target.value as AutomationTriggerType)}
            >
              {(Object.keys(TRIGGER_LABELS) as AutomationTriggerType[]).map((value) => (
                <option key={value} value={value}>
                  {TRIGGER_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          {triggerType === "schedule" ? (
            <>
              <Field label="Mode">
                <Select
                  value={scheduleKind}
                  onChange={(event) => setScheduleKind(event.target.value as ScheduleKind)}
                >
                  <option value="interval">Intervalle</option>
                  <option value="cron">Cron UTC (5 champs)</option>
                </Select>
              </Field>
              {scheduleKind === "interval" ? (
                <Field label="Toutes les (minutes)">
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={everyMinutes}
                    onChange={(event) => setEveryMinutes(Number(event.target.value))}
                  />
                </Field>
              ) : (
                <Field label="Expression cron (UTC)">
                  <Input
                    value={cronExpression}
                    onChange={(event) => setCronExpression(event.target.value)}
                    placeholder="0 * * * *"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              )}
            </>
          ) : null}
          {triggerType === "event" ? (
            <>
              <Field label="Type d’événement">
                <Select
                  value={eventType}
                  onChange={(event) =>
                    setEventType(event.target.value as (typeof AUTOMATION_EVENT_TYPES)[number])
                  }
                >
                  {AUTOMATION_EVENT_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Filtre integrationId (optionnel)">
                <Input
                  value={filterIntegrationId}
                  onChange={(event) => setFilterIntegrationId(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field label="Filtre integrationType (optionnel)">
                <Input
                  value={filterIntegrationType}
                  onChange={(event) => setFilterIntegrationType(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
            </>
          ) : null}
          {triggerType === "status-transition" ? (
            <>
              <Field label="Depuis">
                <Select
                  value={fromStatus}
                  onChange={(event) =>
                    setFromStatus(
                      event.target.value as "*" | (typeof AUTOMATION_STATUS_VALUES)[number],
                    )
                  }
                >
                  <option value="*">*</option>
                  {AUTOMATION_STATUS_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Vers">
                <Select
                  value={toStatus}
                  onChange={(event) =>
                    setToStatus(
                      event.target.value as "*" | (typeof AUTOMATION_STATUS_VALUES)[number],
                    )
                  }
                >
                  <option value="*">*</option>
                  {AUTOMATION_STATUS_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="forDurationSeconds (anti-flap)">
                <Input
                  type="number"
                  min={0}
                  max={3600}
                  value={forDurationSeconds}
                  onChange={(event) => setForDurationSeconds(Number(event.target.value))}
                />
              </Field>
              <Field label="Filtre integrationId (optionnel)">
                <Input
                  value={filterIntegrationId}
                  onChange={(event) => setFilterIntegrationId(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field label="Filtre integrationType (optionnel)">
                <Input
                  value={filterIntegrationType}
                  onChange={(event) => setFilterIntegrationType(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
            </>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="ui-form-grid">
          <label>
            <input
              type="checkbox"
              checked={conditionEnabled}
              onChange={(event) => setConditionEnabled(event.target.checked)}
            />{" "}
            Ajouter une condition déclarative
          </label>
          {conditionEnabled ? (
            <>
              <Field label="Champ">
                <Select
                  value={conditionField}
                  onChange={(event) =>
                    setConditionField(event.target.value as (typeof CONDITION_FIELDS)[number])
                  }
                >
                  {CONDITION_FIELDS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Opérateur">
                <Select
                  value={conditionOp}
                  onChange={(event) =>
                    setConditionOp(event.target.value as (typeof CONDITION_COMPARE_OPS)[number])
                  }
                >
                  {CONDITION_COMPARE_OPS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Valeur">
                <Input
                  value={conditionValue}
                  onChange={(event) => setConditionValue(event.target.value)}
                  maxLength={256}
                  autoComplete="off"
                />
              </Field>
            </>
          ) : (
            <p className="ui-muted">Aucune condition — le déclencheur suffit.</p>
          )}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="ui-form-grid">
          <Field label="Action autorisée">
            <Select
              value={actionType}
              onChange={(event) => setActionType(event.target.value as AutomationActionType)}
            >
              {actions.map((action) => (
                <option key={action.actionType} value={action.actionType}>
                  {action.actionType}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Intégration cible">
            <Select
              value={integrationId}
              onChange={(event) => setIntegrationId(event.target.value)}
            >
              <option value="">Sélectionner…</option>
              {matchingIntegrations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.type})
                </option>
              ))}
            </Select>
          </Field>
          {actionType === "ntfy.publish" ? (
            <>
              <Field label="Topic">
                <Input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  maxLength={64}
                />
              </Field>
              <Field label="Titre (optionnel)">
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                />
              </Field>
              <Field label="Message">
                <Input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={4096}
                />
              </Field>
              <Field label="Priorité">
                <Select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as typeof priority)}
                >
                  {(["min", "low", "default", "high", "max"] as const).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tags (max 5)">
                <Input value={tags} onChange={(event) => setTags(event.target.value)} />
              </Field>
            </>
          ) : null}
          {actionType === "qbittorrent.pause" || actionType === "qbittorrent.resume" ? (
            <Field label="Hashes torrents">
              <Input value={hashes} onChange={(event) => setHashes(event.target.value)} />
            </Field>
          ) : null}
          {actionType === "sonarr.refresh-series" ? (
            <Field label="seriesId">
              <Input value={seriesId} onChange={(event) => setSeriesId(event.target.value)} />
            </Field>
          ) : null}
          {actionType === "sonarr.search-episode" ? (
            <Field label="episodeId">
              <Input value={episodeId} onChange={(event) => setEpisodeId(event.target.value)} />
            </Field>
          ) : null}
          {actionType === "radarr.refresh-movie" || actionType === "radarr.search-movie" ? (
            <Field label="movieId">
              <Input value={movieId} onChange={(event) => setMovieId(event.target.value)} />
            </Field>
          ) : null}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="ui-form-grid">
          <Field label="Cooldown (secondes)">
            <Input
              type="number"
              min={0}
              max={86400}
              value={cooldownSeconds}
              onChange={(event) => setCooldownSeconds(Number(event.target.value))}
            />
          </Field>
          <p className="ui-muted">
            Évite les tempêtes de notifications pour la même règle / même état pendant la fenêtre.
          </p>
        </div>
      ) : null}

      {step === 5 || step === 6 ? (
        <div className="ui-form-grid">
          <p>
            <strong>Nom :</strong> {name || "—"}
          </p>
          <p>
            <strong>Déclencheur :</strong> {TRIGGER_LABELS[triggerType]}
          </p>
          <p>
            <strong>Action :</strong> <code>{actionType}</code>
          </p>
          <p>
            <strong>Cooldown :</strong> {cooldownSeconds}s
          </p>
          <p>
            <strong>État initial :</strong> désactivée
          </p>
          {step === 6 ? (
            <Alert tone="info">
              Enregistrement sans activation. Vous pourrez activer, tester (dry-run) puis exécuter
              manuellement depuis la fiche.
            </Alert>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
        <Button type="button" variant="secondary" onClick={goBack} disabled={step === 0 || pending}>
          Précédent
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={goNext} disabled={pending}>
            Suivant
          </Button>
        ) : (
          <Button type="button" onClick={onSave} disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer (désactivée)"}
          </Button>
        )}
      </div>
    </section>
  );
}
