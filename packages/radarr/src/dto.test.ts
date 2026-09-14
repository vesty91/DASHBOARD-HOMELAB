import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  RADARR_HEALTH_MAX,
  RADARR_MOVIE_MAX,
  mapDiskSpace,
  mapHealth,
  mapQueueStatus,
  mapMovie,
  mapSystemStatus,
  parseJsonValue,
} from "./dto";

const KEY = "notareal-radarr-apikey-0123456789";

describe("radarr dto", () => {
  it("maps system status without paths, instance names or secrets", () => {
    const mapped = mapSystemStatus(
      {
        version: "4.0.14.2939",
        appName: "Radarr",
        instanceName: "Home Lab",
        startupPath: "/opt/Radarr",
        appData: "/config",
        isAdmin: true,
        authentication: "forms",
        urlBase: "/radarr",
      },
      [KEY],
    );
    expect(mapped).toEqual({ version: "4.0.14.2939", appName: "Radarr" });
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
        message: "Indexer failed at /data/movies",
        wikiUrl: "https://wiki.radarr.tv/error",
        source: "IndexerStatusCheck",
      },
      { type: "Warning", message: "Download client path /downloads" },
      { type: "NOTICE" },
      { type: "ok" },
    ]);
    expect(mapped).toEqual({ error: 1, warning: 1, notice: 1, other: 1 });
    expect(JSON.stringify(mapped)).not.toContain("/data/movies");
    expect(JSON.stringify(mapped)).not.toContain("wiki.radarr");
    expect(JSON.stringify(mapped)).not.toContain("IndexerStatusCheck");
    expect(() => mapHealth({})).toThrow(IntegrationError);
    expect(() =>
      mapHealth(Array.from({ length: RADARR_HEALTH_MAX + 1 }, () => ({ type: "error" }))),
    ).toThrow(/oversized/i);
  });

  it("keeps only numeric queue counters that exist", () => {
    expect(
      mapQueueStatus({
        totalCount: 4,
        count: 2,
        unknownCount: 1,
        errors: false,
        warnings: true,
        unknownErrors: true,
        records: [{ title: "Secret Movie" }],
      }),
    ).toEqual({ totalCount: 4, count: 2, unknownCount: 1 });
    expect(mapQueueStatus({ totalCount: 3, errors: false, warnings: true })).toEqual({
      totalCount: 3,
    });
    expect(JSON.stringify(mapQueueStatus({ totalCount: 1, title: "Secret Movie" }))).not.toContain(
      "Secret Movie",
    );
    expect(() => mapQueueStatus([])).toThrow(IntegrationError);
  });

  it("counts movies without titles, paths or folders", () => {
    const mapped = mapMovie([
      {
        title: "Secret Movie",
        path: "/data/movies/Secret Movie",
        folder: "/data/movies/Secret Movie",
        rootFolderPath: "/data/movies",
      },
      { title: "Other", images: [{ url: "/MediaCover/1/poster.jpg" }] },
    ]);
    expect(mapped).toEqual({ count: 2, truncated: false });
    expect(JSON.stringify(mapped)).not.toContain("Secret Movie");
    expect(JSON.stringify(mapped)).not.toContain("/data/movies");
    expect(mapMovie(Array.from({ length: RADARR_MOVIE_MAX }, () => ({ title: "x" })))).toEqual({
      count: RADARR_MOVIE_MAX,
      truncated: true,
    });
    expect(() =>
      mapMovie(Array.from({ length: RADARR_MOVIE_MAX + 1 }, () => ({ title: "x" }))),
    ).toThrow(/oversized/i);
    expect(() => mapMovie({ movie: [] })).toThrow(IntegrationError);
    expect(() => mapMovie(["bad"])).toThrow(IntegrationError);
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
