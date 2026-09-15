/** Category floors are 0–1 Lighthouse scores. Byte weight is uncompressed transfer. */
export const lighthouseCategoryBudgets = {
  performance: 0.85,
  accessibility: 0.9,
  "best-practices": 0.9,
  seo: 0.9,
};

export const lighthouseByteWeightBudgetBytes = 1_400_000;

export function evaluateLighthouseCategories(categories, budgets = lighthouseCategoryBudgets) {
  const failures = [];
  for (const [id, minScore] of Object.entries(budgets)) {
    const score = categories[id]?.score;
    if (typeof score !== "number" || Number.isNaN(score) || score < minScore) {
      failures.push({
        id,
        score: typeof score === "number" ? score : null,
        minScore,
      });
    }
  }
  return failures;
}

export function evaluateByteWeight(numericValue, budget = lighthouseByteWeightBudgetBytes) {
  if (typeof numericValue !== "number" || Number.isNaN(numericValue) || numericValue > budget) {
    return {
      id: "total-byte-weight",
      bytes: typeof numericValue === "number" ? numericValue : null,
      maxBytes: budget,
    };
  }
  return null;
}
