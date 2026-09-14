import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  SONARR_HEALTH_MAX,
  SONARR_SERIES_MAX,
  mapDiskSpace,
  mapHealth,
  mapQueueStatus,
  mapSeries,
  mapSystemStatus,
  parseJsonValue,
} from "./dto";

const KEY = "notareal-sonarr-apikey-0123456789";

describe("sonarr dto", () => {
  it("maps system status without paths, instance names or secrets", () => {
    const mapped = mapSystemStatus(
      {
        version: "4.0.14.2939",
        appName: "Sonarr",
        instanceName: "Home Lab",
        startupPath: "/opt/Sonarr",
        appData: "/config",
        isAdmin: true,
        authentication: "forms",
        urlBase: "/sonarr",
      },
      [KEY],
    );
    expect(mapped).toEqual({ version: "4.0.14.2939", appName: "Sonarr" });
    expect(JSON.stringify(mapped)).not.toContain("/opt");
    expect(JSON.stringify(mapped)).not.toContain("Home Lab");
    expect(JSON.stringify(mapped)).not.toContain("forms");
    expect(mapSystemStatus({ version: KEY }, [KEY])).toEqual({ version: "[REDACTED]" });
    expect(mapSystemStatus({ version: "bad\nver" }, [KEY])).toEqual({ version: null });
  });

  it("counts health types without messages, wiki URLs or sources", () => {
    const mapped = mapHealth([
      {
        type: "error",
        message: "Indexer failed at /data/tv",
        wikiUrl: "https://wiki.sonarr.tv/error",
        source: "IndexerStatusCheck",
      },
      { type: "Warning", message: "Download client path /downloads" },
      { type: "NOTICE" },
      { type: "ok" },
    ]);
    expect(mapped).toEqual({ error: 1, warning: 1, notice: 1, other: 1 });
    expect(JSON.stringify(mapped)).not.toContain("/data/tv");
    expect(JSON.stringify(mapped)).not.toContain("wiki.sonarr");
    expect(JSON.stringify(mapped)).not.toContain("IndexerStatusCheck");
    expect(() => mapHealth({})).toThrow(IntegrationError);
    expect(() =>
      mapHealth(Array.from({ length: SONARR_HEALTH_MAX + 1 }, () => ({ type: "error" }))),
    ).toThrow(/oversized/i);
  });

  it("keeps only numeric queue counters that exist", () => {
    expect(
      mapQueueStatus({
        totalCount: 4,
        count: 2,
        unknownCount: 1,
        errors: 0,
        warnings: 1,
        unknownErrors: true,
        records: [{ title: "Secret Show" }],
      }),
    ).toEqual({ totalCount: 4, count: 2, unknownCount: 1, errors: 0, warnings: 1 });
    expect(mapQueueStatus({ totalCount: 3, errors: false, warnings: true })).toEqual({
      totalCount: 3,
    });
    expect(JSON.stringify(mapQueueStatus({ totalCount: 1, title: "Secret Show" }))).not.toContain(
      "Secret Show",
    );
    expect(() => mapQueueStatus([])).toThrow(IntegrationError);
  });

  it("counts series without titles or paths", () => {
    const mapped = mapSeries([
      { title: "Secret Show", path: "/data/tv/Secret Show", rootFolderPath: "/data/tv" },
      { title: "Other", images: [{ url: "/MediaCover/1/poster.jpg" }] },
    ]);
    expect(mapped).toEqual({ count: 2, truncated: false });
    expect(JSON.stringify(mapped)).not.toContain("Secret Show");
    expect(JSON.stringify(mapped)).not.toContain("/data/tv");
    expect(mapSeries(Array.from({ length: SONARR_SERIES_MAX }, () => ({ title: "x" })))).toEqual({
      count: SONARR_SERIES_MAX,
      truncated: true,
    });
    expect(() =>
      mapSeries(Array.from({ length: SONARR_SERIES_MAX + 1 }, () => ({ title: "x" }))),
    ).toThrow(/oversized/i);
    expect(() => mapSeries({ series: [] })).toThrow(IntegrationError);
    expect(() => mapSeries(["bad"])).toThrow(IntegrationError);
  });

  it("aggregates disk space without paths or labels", () => {
    const mapped = mapDiskSpace([
      { path: "/data", label: "tv", freeSpace: 100, totalSpace: 400 },
      { path: "/downloads", label: "dl", freeSpace: 50, totalSpace: 200 },
      { path: "/skip", label: "bad" },
    ]);
    expect(mapped).toEqual({ freeBytes: 150, totalBytes: 600 });
    expect(JSON.stringify(mapped)).not.toContain("/data");
    expect(JSON.stringify(mapped)).not.toContain("tv");
    expect(() =>
      mapDiskSpace(Array.from({ length: 65 }, () => ({ freeSpace: 1, totalSpace: 2 }))),
    ).toThrow(/oversized/i);
    expect(() => mapDiskSpace("bad")).toThrow(IntegrationError);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseJsonValue("{")).toThrow(/invalid JSON/);
  });
});
