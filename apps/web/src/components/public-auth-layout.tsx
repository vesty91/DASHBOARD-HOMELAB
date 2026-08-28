import type { ReactNode } from "react";

export function PublicAuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="shell-brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          Homelab
        </div>
        <h1>{title}</h1>
        {description ? <p className="ui-muted">{description}</p> : null}
        {children}
      </div>
    </div>
  );
}
