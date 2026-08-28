import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

export function Alert({
  tone = "info",
  title,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: AlertTone; title?: string; children?: ReactNode }) {
  return (
    <div role="alert" className={cn("ui-alert", `ui-alert-${tone}`, className)} {...props}>
      {title ? <p className="ui-alert-title">{title}</p> : null}
      {children}
    </div>
  );
}
