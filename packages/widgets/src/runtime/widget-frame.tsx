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
      <h2>{title}</h2>
      {state === "ready" ? (
        children
      ) : (
        <WidgetStateView state={state} {...(message ? { message } : {})} />
      )}
    </article>
  );
}
