import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import { assembleMonitorsDto, parsePrometheusMonitors, UPTIME_KUMA_MONITORS_MAX } from "./dto";

const API_KEY = "UK-API-SUPER-SECRET";

function metrics(lines: readonly string[]): string {
  return ["# HELP monitor_status Monitor Status", "# TYPE monitor_status gauge", ...lines].join(
    "\n",
  );
}

describe("uptime-kuma dto", () => {
  it("parses official Prometheus series and hides raw labels", () => {
    const parsed = parsePrometheusMonitors(
      metrics([
        `monitor_status{monitor_id="1",monitor_name="NAS",monitor_type="http",monitor_url="https://nas.lab/${API_KEY}",monitor_hostname="nas.lab",monitor_port="443"} 1`,
        `monitor_response_time{monitor_id="1",monitor_name="NAS",monitor_type="http",monitor_url="https://nas.lab/${API_KEY}",monitor_hostname="nas.lab",monitor_port="443"} 42`,
        `monitor_uptime_ratio{monitor_id="1",monitor_name="NAS",monitor_type="http",monitor_url="https://nas.lab/${API_KEY}",monitor_hostname="nas.lab",monitor_port="443",window="1d"} 0.99`,
        `monitor_uptime_ratio{monitor_id="1",monitor_name="NAS",monitor_type="http",monitor_url="https://nas.lab/${API_KEY}",monitor_hostname="nas.lab",monitor_port="443",window="30d"} 0.1`,
      ]),
      [API_KEY],
    );
    expect(parsed.truncated).toBe(false);
    expect(parsed.monitors).toEqual([
      {
        id: "1",
        name: "NAS",
        status: "up",
        latencyMs: 42,
        uptimePercent: 99,
      },
    ]);
    expect(JSON.stringify(parsed)).not.toContain(API_KEY);
    expect(JSON.stringify(parsed)).not.toContain("nas.lab");
    expect(JSON.stringify(parsed)).not.toContain("monitor_url");
    expect(JSON.stringify(parsed)).not.toContain("443");
  });

  it("joins by monitor_name when monitor_id is absent", () => {
    const parsed = parsePrometheusMonitors(
      metrics([
        'monitor_status{monitor_name="Ping"} 0',
        'monitor_response_time{monitor_name="Ping"} -1',
      ]),
    );
    expect(parsed.monitors[0]).toMatchObject({
      id: "Ping",
      name: "Ping",
      status: "down",
      latencyMs: null,
    });
  });

  it("maps latency -1 to null and rejects unknown statuses", () => {
    const missingPing = parsePrometheusMonitors(
      metrics([
        'monitor_status{monitor_id="2",monitor_name="DNS"} 2',
        'monitor_response_time{monitor_id="2",monitor_name="DNS"} -1',
      ]),
    );
    expect(missingPing.monitors[0]?.latencyMs).toBeNull();
    expect(missingPing.monitors[0]?.status).toBe("pending");
    expect(() =>
      parsePrometheusMonitors(metrics(['monitor_status{monitor_id="3",monitor_name="X"} 9'])),
    ).toThrow(IntegrationError);
    expect(() =>
      parsePrometheusMonitors(metrics(['monitor_status{monitor_id="3",monitor_name="X"} NaN'])),
    ).toThrow(/finite/);
  });

  it("rejects an uptime ratio that already looks like a percent", () => {
    expect(() =>
      parsePrometheusMonitors(
        metrics([
          'monitor_status{monitor_id="1",monitor_name="NAS"} 1',
          'monitor_uptime_ratio{monitor_id="1",monitor_name="NAS",window="1d"} 99',
        ]),
      ),
    ).toThrow(/uptime ratio/);
  });

  it("treats unsafe latency as null and redacts secrets in names", () => {
    const parsed = parsePrometheusMonitors(
      metrics([
        `monitor_status{monitor_id="1",monitor_name="${API_KEY}"} 3`,
        `monitor_response_time{monitor_id="1",monitor_name="${API_KEY}"} ${Number.MAX_SAFE_INTEGER + 1}`,
      ]),
      [API_KEY],
    );
    expect(parsed.monitors[0]?.status).toBe("maintenance");
    expect(parsed.monitors[0]?.latencyMs).toBeNull();
    expect(parsed.monitors[0]?.name).not.toContain(API_KEY);
  });

  it("truncates after 200 monitors", () => {
    const lines = Array.from({ length: UPTIME_KUMA_MONITORS_MAX + 5 }, (_, index) => {
      return `monitor_status{monitor_id="${index + 1}",monitor_name="M${index + 1}"} 1`;
    });
    const parsed = parsePrometheusMonitors(metrics(lines));
    expect(parsed.truncated).toBe(true);
    expect(parsed.monitors).toHaveLength(UPTIME_KUMA_MONITORS_MAX);
  });

  it("counts canonical statuses only", () => {
    const dto = assembleMonitorsDto(
      [
        { id: "a", name: "A", status: "up", latencyMs: 1, uptimePercent: 100 },
        { id: "b", name: "B", status: "down", latencyMs: null, uptimePercent: null },
        { id: "c", name: "C", status: "pending", latencyMs: null, uptimePercent: null },
        { id: "d", name: "D", status: "maintenance", latencyMs: 4, uptimePercent: 50 },
      ],
      false,
    );
    expect(dto).toMatchObject({
      monitorCount: 4,
      upCount: 1,
      downCount: 1,
      pendingCount: 1,
      maintenanceCount: 1,
      truncated: false,
    });
  });
});
