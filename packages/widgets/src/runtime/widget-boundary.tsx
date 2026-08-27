"use client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { WidgetStateView } from "./widget-state-view";

interface Props {
  children: ReactNode;
  resetKey?: string;
}

interface State {
  failed: boolean;
  resetKey: string;
}

export class WidgetBoundary extends Component<Props, State> {
  override state: State = { failed: false, resetKey: this.props.resetKey ?? "" };

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    const resetKey = props.resetKey ?? "";
    if (resetKey !== state.resetKey) return { failed: false, resetKey };
    return null;
  }

  static getDerivedStateFromError(): Partial<State> {
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
