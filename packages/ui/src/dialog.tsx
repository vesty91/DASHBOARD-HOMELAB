"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";
import { cn } from "./cn";

export function Dialog({
  open,
  title,
  onClose,
  children,
  className,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("ui-scroll-lock");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("ui-scroll-lock");
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ui-overlay">
      <button type="button" className="ui-overlay-backdrop" aria-label="Fermer" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn("ui-dialog", className)}
      >
        <header className="ui-dialog-header">
          <h2 id={titleId} className="ui-dialog-title">
            {title}
          </h2>
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
        </header>
        <div className="ui-dialog-body">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  children,
  onCancel,
  confirmAction,
  onConfirm,
  confirmLabel = "Confirmer",
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  confirmAction?: (formData: FormData) => void | Promise<void>;
  onConfirm?: () => void;
  confirmLabel?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("ui-scroll-lock");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("ui-scroll-lock");
    };
  }, [onCancel]);

  return (
    <div className="ui-overlay">
      <button
        type="button"
        className="ui-overlay-backdrop"
        aria-label="Fermer"
        onClick={onCancel}
      />
      <section
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="ui-dialog"
      >
        <h2 id={titleId} className="ui-dialog-title">
          {title}
        </h2>
        <div className="ui-dialog-body">{children}</div>
        <div className="ui-dialog-actions">
          <Button onClick={onCancel}>Annuler</Button>
          {confirmAction ? (
            <form action={confirmAction}>
              <Button variant="danger" type="submit">
                {confirmLabel}
              </Button>
            </form>
          ) : (
            <Button variant="danger" {...(onConfirm ? { onClick: onConfirm } : {})}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
