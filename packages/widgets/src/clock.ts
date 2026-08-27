import { z } from "zod";
import type { WidgetContract } from "./types";

export function isValidTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const clockConfigSchema = z.object({
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isValidTimeZone, "Timezone must be a valid IANA identifier"),
  showDate: z.boolean().default(true),
  showSeconds: z.boolean().default(false),
  hour12: z.boolean().default(false),
});

export type ClockConfig = z.infer<typeof clockConfigSchema>;

export const clockDefaultConfig: ClockConfig = {
  timezone: "UTC",
  showDate: true,
  showSeconds: false,
  hour12: false,
};

export function formatClock(
  date: Date,
  config: ClockConfig,
  locale = "fr-FR",
): { time: string; dateLabel: string | null; iso: string } {
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: config.timezone,
    hour: "numeric",
    minute: "2-digit",
    ...(config.showSeconds ? { second: "2-digit" as const } : {}),
    hour12: config.hour12,
  }).format(date);
  const dateLabel = config.showDate
    ? new Intl.DateTimeFormat(locale, {
        timeZone: config.timezone,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(date)
    : null;
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(", ", "T");
  return { time, dateLabel, iso };
}

export const clockContract: WidgetContract<ClockConfig> = {
  id: "clock",
  version: 1,
  name: "Horloge",
  description: "Affiche l'heure locale pour un fuseau IANA.",
  category: "information",
  defaultSize: { w: 4, h: 2 },
  minSize: { w: 2, h: 1 },
  maxSize: { w: 8, h: 4 },
  defaultConfig: clockDefaultConfig,
  configSchema: clockConfigSchema,
  publicSafe: true,
};
