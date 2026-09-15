import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateByteWeight,
  evaluateLighthouseCategories,
  lighthouseByteWeightBudgetBytes,
  lighthouseCategoryBudgets,
} from "./lighthouse-budgets.mjs";

test("category budgets fail below the floor and pass at the floor", () => {
  const categories = {
    performance: { score: lighthouseCategoryBudgets.performance },
    accessibility: { score: 0.89 },
    "best-practices": { score: 1 },
    seo: { score: lighthouseCategoryBudgets.seo },
  };
  const failures = evaluateLighthouseCategories(categories);
  assert.deepEqual(
    failures.map((failure) => failure.id),
    ["accessibility"],
  );
  assert.equal(evaluateLighthouseCategories(categories).length, 1);
  assert.equal(
    evaluateLighthouseCategories({
      performance: { score: 0.99 },
      accessibility: { score: 0.9 },
      "best-practices": { score: 0.9 },
      seo: { score: 0.9 },
    }).length,
    0,
  );
});

test("byte-weight budget rejects missing or oversized payloads", () => {
  assert.equal(evaluateByteWeight(lighthouseByteWeightBudgetBytes), null);
  assert.equal(evaluateByteWeight(lighthouseByteWeightBudgetBytes + 1)?.id, "total-byte-weight");
  assert.equal(evaluateByteWeight(undefined)?.id, "total-byte-weight");
});
