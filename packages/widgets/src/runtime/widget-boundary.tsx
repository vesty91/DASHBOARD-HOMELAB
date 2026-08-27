"use client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { WidgetStateView } from "./widget-state-view";

interface State {
  failed: boolean;
}

export class WidgetBoundary extends Component<{ children: ReactNode; title?: string }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    this.setState({ failed: true });
  }

  override render(): ReactNode {
    if (this.state.failed) return <WidgetStateView state="error" />;
    return this.props.children;
  }
}
