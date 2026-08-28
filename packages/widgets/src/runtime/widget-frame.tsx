"use client";
import type { ReactNode } from "react";
import type { WidgetRuntimeState } from "../types";
import { WidgetStateView } from "./widget-state-view";

export function WidgetFrame({
  title,
  state = "ready",
  message,
  children,
}: {
  title: string;
  state?: WidgetRuntimeState;
  message?: string;
  children?: ReactNode;
}) {
  return (
    <article className="widget-frame" data-widget-state={state}>
      <header className="widget-frame-header">
        <h2>{title}</h2>
      </header>
      <div className="widget-frame-body">
        {state === "ready" ? (
          children
        ) : (
          <WidgetStateView state={state} {...(message ? { message } : {})} />
        )}
      </div>
    </article>
  );
}
