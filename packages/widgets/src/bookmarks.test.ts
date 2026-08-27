import { describe, expect, it } from "vitest";
import { bookmarksConfigSchema } from "./bookmarks";
import { createEmptyBookmarkLink } from "./runtime/bookmarks-form";
import { parseHttpUrl } from "./urls";

describe("bookmarks widget", () => {
  const link = {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Docs",
    url: "https://example.com",
    target: "new-tab" as const,
  };

  it("accepts http(s) links and caps the list", () => {
    expect(bookmarksConfigSchema.parse({ links: [link] }).links[0]?.url).toBe(
      "https://example.com/",
    );
    expect(
      bookmarksConfigSchema.safeParse({
        links: Array.from({ length: 51 }, (_, index) => ({
          ...link,
          id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
        })),
      }).success,
    ).toBe(false);
  });

  it("rejects javascript, data, file, blob, ftp and credential URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "file:///etc/passwd",
      "blob:https://example.com/1",
      "ftp://example.com/file",
      "http://user:pass@example.com/",
    ]) {
      expect(parseHttpUrl(url)).toBeNull();
      expect(bookmarksConfigSchema.safeParse({ links: [{ ...link, url }] }).success).toBe(false);
    }
  });

  it("starts a new bookmark with a blank URL that cannot be persisted", () => {
    const draft = createEmptyBookmarkLink();
    expect(draft.url).toBe("");
    expect(draft.url).not.toContain("example.com");
    expect(bookmarksConfigSchema.safeParse({ links: [draft] }).success).toBe(false);
    expect(
      bookmarksConfigSchema.safeParse({
        links: [{ ...draft, title: "Docs", url: "https://example.com/docs" }],
      }).success,
    ).toBe(true);
  });
});
