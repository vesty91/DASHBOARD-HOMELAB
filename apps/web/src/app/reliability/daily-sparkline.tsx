"use client";

import type { DailyReliabilityRollup } from "@dashboard/reliability";

function dailyAvailabilityBps(day: DailyReliabilityRollup): number | null {
  const eligible = Math.max(0, day.observedSeconds - day.maintenanceSeconds - day.unknownSeconds);
  if (eligible === 0) return null;
  return Math.floor((day.availableSeconds * 100_000) / eligible);
}

export function DailySparkline({ days }: { days: readonly DailyReliabilityRollup[] }) {
  const sorted = [...days].sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
  const values = sorted.map((day) => dailyAvailabilityBps(day) ?? 0);
  if (values.length < 2) {
    return (
      <svg viewBox="0 0 100 24" role="img" aria-label="Tendance de disponibilité indisponible">
        <line x1="0" y1="12" x2="100" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 24 - ((value - min) / span) * 24;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 24"
      role="img"
      aria-label="Tendance de disponibilité quotidienne"
      data-testid="reliability-daily-sparkline"
    >
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={points} />
    </svg>
  );
}
