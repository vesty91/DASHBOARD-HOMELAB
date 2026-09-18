import Image from "next/image";
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
          <Image
            src="/branding/restor-pc-logo.png"
            alt="Restor_Pc — Dashboard Homelab"
            width={280}
            height={210}
            className="auth-brand-logo"
            sizes="(max-width: 640px) 200px, 280px"
            priority
          />
        </div>
        <h1>{title}</h1>
        {description ? <p className="ui-muted">{description}</p> : null}
        {children}
      </div>
    </div>
  );
}
