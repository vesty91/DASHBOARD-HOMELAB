import type { ReactNode } from "react";

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="ui-tooltip">
      {children}
      <span role="tooltip" className="ui-tooltip-label">
        {label}
      </span>
    </span>
  );
}
