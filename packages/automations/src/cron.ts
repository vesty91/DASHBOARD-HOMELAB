import { AutomationError } from "./errors";

const MAX_LOOKAHEAD_MINUTES = 8 * 24 * 60;
const CRON_FIELD_COUNT = 5;

export interface ParsedCron {
  minutes: ReadonlySet<number>;
  hours: ReadonlySet<number>;
  daysOfMonth: ReadonlySet<number>;
  months: ReadonlySet<number>;
  daysOfWeek: ReadonlySet<number>;
  expression: string;
}

function parseList(field: string, min: number, max: number, label: string): Set<number> {
  if (field === "*") {
    const all = new Set<number>();
    for (let value = min; value <= max; value += 1) all.add(value);
    return all;
  }
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const stepMatch = /^(?:\*|(\d{1,2})(?:-(\d{1,2}))?)\/(\d{1,2})$/u.exec(part);
    if (stepMatch) {
      const start = stepMatch[1] === undefined ? min : Number(stepMatch[1]);
      const end = stepMatch[2] === undefined ? max : Number(stepMatch[2]);
      const step = Number(stepMatch[3]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(step))
        throw new AutomationError("VALIDATION_ERROR", `Invalid cron ${label}`);
      if (start < min || end > max || start > end || step < 1)
        throw new AutomationError("VALIDATION_ERROR", `Invalid cron ${label}`);
      for (let value = start; value <= end; value += step) values.add(value);
      continue;
    }
    const rangeMatch = /^(\d{1,2})-(\d{1,2})$/u.exec(part);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < min || end > max || start > end)
        throw new AutomationError("VALIDATION_ERROR", `Invalid cron ${label}`);
      for (let value = start; value <= end; value += 1) values.add(value);
      continue;
    }
    if (!/^\d{1,2}$/u.test(part))
      throw new AutomationError("VALIDATION_ERROR", `Invalid cron ${label}`);
    const value = Number(part);
    if (value < min || value > max)
      throw new AutomationError("VALIDATION_ERROR", `Invalid cron ${label}`);
    values.add(value);
  }
  if (values.size === 0) throw new AutomationError("VALIDATION_ERROR", `Invalid cron ${label}`);
  return values;
}

export function parseFiveFieldCron(expression: string): ParsedCron {
  const trimmed = expression.trim();
  if (trimmed.length === 0 || trimmed.length > 64)
    throw new AutomationError("VALIDATION_ERROR", "Invalid cron expression");
  if (/[a-z@#]/iu.test(trimmed))
    throw new AutomationError("VALIDATION_ERROR", "Cron names and macros are not supported");
  const fields = trimmed.split(/\s+/u);
  if (fields.length !== CRON_FIELD_COUNT)
    throw new AutomationError("VALIDATION_ERROR", "Cron expression must have 5 fields");
  const minutes = parseList(fields[0]!, 0, 59, "minute");
  const hours = parseList(fields[1]!, 0, 23, "hour");
  const daysOfMonth = parseList(fields[2]!, 1, 31, "day-of-month");
  const months = parseList(fields[3]!, 1, 12, "month");
  const daysOfWeek = parseList(fields[4]!.replaceAll("7", "0"), 0, 6, "day-of-week");
  return { minutes, hours, daysOfMonth, months, daysOfWeek, expression: trimmed };
}

function matchesCron(date: Date, cron: ParsedCron): boolean {
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const dayOfMonth = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const dayOfWeek = date.getUTCDay();
  if (!cron.minutes.has(minute) || !cron.hours.has(hour) || !cron.months.has(month)) return false;
  const domRestricted = cron.daysOfMonth.size !== 31;
  const dowRestricted = cron.daysOfWeek.size !== 7;
  if (domRestricted && dowRestricted)
    return cron.daysOfMonth.has(dayOfMonth) || cron.daysOfWeek.has(dayOfWeek);
  if (domRestricted) return cron.daysOfMonth.has(dayOfMonth);
  if (dowRestricted) return cron.daysOfWeek.has(dayOfWeek);
  return true;
}

export function nextCronOccurrenceUtc(from: Date, cron: ParsedCron): Date | null {
  const cursor = new Date(Math.floor(from.getTime() / 60_000) * 60_000 + 60_000);
  for (let index = 0; index < MAX_LOOKAHEAD_MINUTES; index += 1) {
    if (matchesCron(cursor, cron)) return new Date(cursor);
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}
