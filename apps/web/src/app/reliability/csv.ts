import type { DailyReliabilityRollup } from "@dashboard/reliability";

const CSV_HEADERS = [
  "dateUtc",
  "observedSeconds",
  "availableSeconds",
  "degradedSeconds",
  "unavailableSeconds",
  "maintenanceSeconds",
  "unknownSeconds",
  "incidentCount",
] as const;

export function escapeCsvCell(value: string | number): string {
  const str = String(value);
  const needsQuote = /[",\n\r]/.test(str) || /^[=+\-@]/.test(str);
  const escaped = str.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

export function dailyRollupsToCsv(rows: readonly DailyReliabilityRollup[]): string {
  const lines = [CSV_HEADERS.join(",")];
  const sorted = [...rows].sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
  for (const row of sorted) {
    lines.push(
      [
        row.dateUtc,
        row.observedSeconds,
        row.availableSeconds,
        row.degradedSeconds,
        row.unavailableSeconds,
        row.maintenanceSeconds,
        row.unknownSeconds,
        row.incidentCount,
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
