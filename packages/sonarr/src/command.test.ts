import { describe, expect, it } from "vitest";
import {
  serializeSonarrCommand,
  sonarrCommandResourceId,
  sonarrEpisodeSearchCommand,
  sonarrRefreshSeriesCommand,
} from "./command";

describe("sonarr command allowlist", () => {
  it("builds official RefreshSeries and EpisodeSearch bodies for a single id", () => {
    const refresh = sonarrRefreshSeriesCommand(12);
    expect(serializeSonarrCommand(refresh)).toBe('{"name":"RefreshSeries","seriesId":12}');
    expect(sonarrCommandResourceId(refresh)).toBe("series:12");
    const search = sonarrEpisodeSearchCommand(34);
    expect(serializeSonarrCommand(search)).toBe('{"name":"EpisodeSearch","episodeIds":[34]}');
    expect(sonarrCommandResourceId(search)).toBe("episode:34");
    expect(serializeSonarrCommand(refresh)).not.toMatch(/RssSync|SeriesSearch|RescanSeries/u);
  });

  it("rejects zero, negative and oversized ids", () => {
    expect(() => sonarrRefreshSeriesCommand(0)).toThrow(/resource id/);
    expect(() => sonarrEpisodeSearchCommand(-1)).toThrow(/resource id/);
    expect(() => sonarrRefreshSeriesCommand(2_147_483_648)).toThrow(/resource id/);
  });
});
