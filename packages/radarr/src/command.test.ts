import { describe, expect, it } from "vitest";
import {
  radarrCommandResourceId,
  radarrMoviesSearchCommand,
  radarrRefreshMovieCommand,
  serializeRadarrCommand,
} from "./command";

describe("radarr command allowlist", () => {
  it("builds official RefreshMovie and MoviesSearch bodies for a single movie id", () => {
    const refresh = radarrRefreshMovieCommand(20);
    expect(serializeRadarrCommand(refresh)).toBe('{"name":"RefreshMovie","movieIds":[20]}');
    expect(radarrCommandResourceId(refresh)).toBe("movie:20");
    const search = radarrMoviesSearchCommand(42);
    expect(serializeRadarrCommand(search)).toBe('{"name":"MoviesSearch","movieIds":[42]}');
    expect(radarrCommandResourceId(search)).toBe("search:42");
    expect(serializeRadarrCommand(refresh)).not.toMatch(/RssSync|RenameMovie|RefreshCollections/u);
  });

  it("rejects zero, negative and oversized ids", () => {
    expect(() => radarrRefreshMovieCommand(0)).toThrow(/resource id/);
    expect(() => radarrMoviesSearchCommand(-1)).toThrow(/resource id/);
    expect(() => radarrRefreshMovieCommand(2_147_483_648)).toThrow(/resource id/);
  });
});
