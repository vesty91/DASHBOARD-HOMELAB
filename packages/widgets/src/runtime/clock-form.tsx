"use client";
import type { ClockConfig } from "../clock";

function timeZones(): string[] {
  const required = ["UTC", "Europe/Paris", "America/New_York", "Europe/London", "Asia/Tokyo"];
  const supported =
    typeof Intl !== "undefined" && "supportedValuesOf" in Intl
      ? Intl.supportedValuesOf("timeZone")
      : required;
  return [...new Set([...required, ...supported])];
}

export function ClockForm({
  config,
  onChange,
}: {
  config: ClockConfig;
  onChange: (config: ClockConfig) => void;
}) {
  const zones = timeZones();
  return (
    <fieldset>
      <legend>Configuration de l'horloge</legend>
      <label>
        Fuseau horaire
        <select
          value={config.timezone}
          onChange={(event) => onChange({ ...config, timezone: event.target.value })}
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={config.showDate}
          onChange={(event) => onChange({ ...config, showDate: event.target.checked })}
        />{" "}
        Afficher la date
      </label>
      <label>
        <input
          type="checkbox"
          checked={config.showSeconds}
          onChange={(event) => onChange({ ...config, showSeconds: event.target.checked })}
        />{" "}
        Afficher les secondes
      </label>
      <label>
        <input
          type="checkbox"
          checked={config.hour12}
          onChange={(event) => onChange({ ...config, hour12: event.target.checked })}
        />{" "}
        Format 12 heures
      </label>
    </fieldset>
  );
}
