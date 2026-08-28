"use client";
import { useEffect, useState } from "react";
import type { ClockConfig } from "../clock";
import { formatClock } from "../clock";

export function ClockWidget({ config }: { config: ClockConfig }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const intervalMs = config.showSeconds ? 1000 : 30_000;
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [config.showSeconds]);
  if (!now) {
    return (
      <p className="widget-clock" data-clock-timezone={config.timezone}>
        {config.timezone}
      </p>
    );
  }
  const formatted = formatClock(now, config);
  return (
    <div className="widget-clock" data-clock-timezone={config.timezone}>
      <time dateTime={formatted.iso}>{formatted.time}</time>
      {formatted.dateLabel ? <p>{formatted.dateLabel}</p> : null}
    </div>
  );
}
