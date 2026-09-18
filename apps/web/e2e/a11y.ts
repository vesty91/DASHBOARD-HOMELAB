import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Wait for a non-empty document title before axe.
 * Soft navigations can briefly leave <title> empty while Next streams metadata.
 */
export async function expectPageA11y(page: Page) {
  await expect
    .poll(async () => (await page.title()).trim(), {
      timeout: 15_000,
      message: "document <title> must be non-empty before axe",
    })
    .not.toBe("");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const details = results.violations
    .map((violation) => {
      const targets = violation.nodes
        .map((node) => node.target.map((part) => String(part)).join(" "))
        .join("; ");
      return `${violation.id} [${violation.impact ?? "unknown"}] ${violation.help} (${targets})`;
    })
    .join("\n");
  expect(results.violations, details || "no axe violations").toEqual([]);
}
