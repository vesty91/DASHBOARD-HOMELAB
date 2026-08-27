/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WidgetBoundary } from "./widget-boundary";

function ThrowingWidget(): never {
  throw new Error("widget boom");
}

function Neighbor() {
  return <p>Voisin intact</p>;
}

function Flaky({ fail }: { fail: boolean }) {
  if (fail) throw new Error("widget boom");
  return <p>Récupéré</p>;
}

describe("widget error isolation", () => {
  afterEach(() => cleanup());

  it("isolates a throwing widget without breaking a neighbor", () => {
    render(
      <div>
        <WidgetBoundary>
          <ThrowingWidget />
        </WidgetBoundary>
        <Neighbor />
      </div>,
    );
    expect(screen.getByText("Ce widget a rencontré une erreur")).toBeTruthy();
    expect(screen.getByText("Voisin intact")).toBeTruthy();
    expect(screen.queryByText("widget boom")).toBeNull();
  });

  it("recovers when resetKey changes after a render error", () => {
    const { rerender } = render(
      <WidgetBoundary resetKey="broken">
        <Flaky fail />
      </WidgetBoundary>,
    );
    expect(screen.getByText("Ce widget a rencontré une erreur")).toBeTruthy();
    rerender(
      <WidgetBoundary resetKey="fixed">
        <Flaky fail={false} />
      </WidgetBoundary>,
    );
    expect(screen.getByText("Récupéré")).toBeTruthy();
    expect(screen.queryByText("widget boom")).toBeNull();
  });
});
