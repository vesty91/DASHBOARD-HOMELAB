/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WidgetRenderer } from "./widget-renderer";

vi.mock("./clock-widget", () => ({
  ClockWidget: () => <p>Horloge rendue</p>,
}));

afterEach(() => cleanup());

describe("widget renderer app tile isolation", () => {
  it("keeps Clock visible when an adjacent App Tile resolution is in error", () => {
    render(
      <div>
        <WidgetRenderer
          item={{
            id: "clock-1",
            widgetType: "clock",
            widgetVersion: 1,
            title: "Horloge",
            config: { timezone: "UTC", showDate: true, showSeconds: false, hour12: false },
            runtimeStatus: "ready",
          }}
        />
        <WidgetRenderer
          item={{
            id: "tile-1",
            widgetType: "app-tile",
            widgetVersion: 1,
            title: "Tuile",
            config: {
              appId: "22222222-2222-4222-8222-222222222222",
              showStatus: true,
              showLatency: false,
            },
            runtimeStatus: "ready",
          }}
          appView={{ status: "error" }}
        />
      </div>,
    );
    expect(screen.getByText("Horloge rendue")).toBeTruthy();
    expect(screen.getByText("Ce widget a rencontré une erreur")).toBeTruthy();
    expect(screen.queryByText("Error")).toBeNull();
    expect(screen.queryByText(/stack/i)).toBeNull();
  });
});
