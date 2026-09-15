import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export async function expectPageA11y(page: Page) {
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
