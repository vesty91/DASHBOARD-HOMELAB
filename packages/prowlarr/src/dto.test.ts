import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  PROWLARR_HEALTH_MAX,
  PROWLARR_INDEXER_MAX,
  PROWLARR_INDEXERSTATUS_MAX,
  mapHealth,
  mapIndexer,
  mapIndexerStatus,
  mapSystemStatus,
  parseJsonValue,
} from "./dto";

const KEY = "notareal-prowlarr-apikey-0123456789";

describe("prowlarr dto", () => {
  it("maps system status without paths, instance names or secrets", () => {
    const mapped = mapSystemStatus(
      {
        version: "1.32.2.4987",
        appName: "Prowlarr",
        instanceName: "Home Lab",
        startupPath: "/opt/Prowlarr",
        appData: "/config",
        isAdmin: true,
        authentication: "forms",
        urlBase: "/prowlarr",
      },
      [KEY],
    );
    expect(mapped).toEqual({ version: "1.32.2.4987", appName: "Prowlarr" });
    expect(JSON.stringify(mapped)).not.toContain("/opt");
    expect(JSON.stringify(mapped)).not.toContain("Home Lab");
    expect(JSON.stringify(mapped)).not.toContain("forms");
    expect(JSON.stringify(mapped)).not.toContain("isAdmin");
    expect(mapSystemStatus({ version: KEY }, [KEY])).toEqual({ version: "[REDACTED]" });
    expect(mapSystemStatus({ version: "bad\nver" }, [KEY])).toEqual({ version: null });
  });

  it("counts health types without messages, wiki URLs or sources", () => {
    const mapped = mapHealth([
      {
        type: "error",
        message: "Indexer failed at /data/indexers",
        wikiUrl: "https://wiki.prowlarr.com/error",
        source: "IndexerStatusCheck",
      },
      { type: "Warning", message: "Download client path /downloads" },
      { type: "NOTICE" },
      { type: "ok" },
    ]);
    expect(mapped).toEqual({ error: 1, warning: 1, notice: 1, other: 1 });
    expect(JSON.stringify(mapped)).not.toContain("/data/indexers");
    expect(JSON.stringify(mapped)).not.toContain("wiki.prowlarr");
    expect(JSON.stringify(mapped)).not.toContain("IndexerStatusCheck");
    expect(() => mapHealth({})).toThrow(IntegrationError);
    expect(() =>
      mapHealth(Array.from({ length: PROWLARR_HEALTH_MAX + 1 }, () => ({ type: "error" }))),
    ).toThrow(/oversized/i);
  });

  it("counts indexers from enable without names, urls or secrets", () => {
    const mapped = mapIndexer([
      {
        name: "Secret Tracker",
        enable: true,
        indexerUrls: ["https://tracker.example"],
        fields: [
          { name: "apiKey", value: KEY },
          { name: "password", value: "hunter2" },
        ],
        categories: [{ name: "Movies" }],
        privacy: "private",
      },
      { name: "Other", enable: false, protocol: "torrent" },
      { name: "Usenet", enable: true },
    ]);
    expect(mapped).toEqual({ count: 3, enabledCount: 2 });
    expect(JSON.stringify(mapped)).not.toContain("Secret Tracker");
    expect(JSON.stringify(mapped)).not.toContain("tracker.example");
    expect(JSON.stringify(mapped)).not.toContain(KEY);
    expect(JSON.stringify(mapped)).not.toContain("hunter2");
    expect(JSON.stringify(mapped)).not.toContain("Movies");
    expect(JSON.stringify(mapped)).not.toContain("private");
    expect(
      mapIndexer(Array.from({ length: PROWLARR_INDEXER_MAX }, () => ({ enable: true }))),
    ).toEqual({
      count: PROWLARR_INDEXER_MAX,
      enabledCount: PROWLARR_INDEXER_MAX,
    });
    expect(() =>
      mapIndexer(Array.from({ length: PROWLARR_INDEXER_MAX + 1 }, () => ({ enable: true }))),
    ).toThrow(/oversized/i);
    expect(() => mapIndexer({ indexer: [] })).toThrow(IntegrationError);
    expect(() => mapIndexer(["bad"])).toThrow(IntegrationError);
  });

  it("counts indexer status entries without indexer names", () => {
    const mapped = mapIndexerStatus([
      {
        indexerId: 1,
        name: "Secret Tracker",
        mostRecentFailure: "2026-09-14T00:00:00Z",
        disabledTill: "2026-09-15T00:00:00Z",
      },
      { indexerId: 2, name: "Other" },
    ]);
    expect(mapped).toEqual({ count: 2 });
    expect(JSON.stringify(mapped)).not.toContain("Secret Tracker");
    expect(JSON.stringify(mapped)).not.toContain("Other");
    expect(() =>
      mapIndexerStatus(
        Array.from({ length: PROWLARR_INDEXERSTATUS_MAX + 1 }, () => ({ indexerId: 1 })),
      ),
    ).toThrow(/oversized/i);
    expect(() => mapIndexerStatus({ statuses: [] })).toThrow(IntegrationError);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseJsonValue("{")).toThrow(/invalid JSON/);
  });
});
