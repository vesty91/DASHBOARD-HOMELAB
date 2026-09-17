import { describe, expect, it } from "vitest";
import {
  ACTUAL_STATUS_LABELS,
  IMPACT_STATUS_LABELS,
  actualStatusTone,
  impactStatusTone,
} from "./labels";

describe("topology labels", () => {
  it("exposes text labels for every actual and impact status", () => {
    expect(ACTUAL_STATUS_LABELS.available).toMatch(/Disponible/i);
    expect(ACTUAL_STATUS_LABELS.unavailable).toMatch(/Indisponible/i);
    expect(ACTUAL_STATUS_LABELS.unknown).toMatch(/Inconnu/i);
    expect(IMPACT_STATUS_LABELS.none).toMatch(/Aucun/i);
    expect(IMPACT_STATUS_LABELS["at-risk"]).toMatch(/risque/i);
    expect(IMPACT_STATUS_LABELS.impacted).toMatch(/Impacté/i);
  });

  it("maps statuses to distinct badge tones without relying on colour alone", () => {
    expect(actualStatusTone("available")).toBe("success");
    expect(actualStatusTone("unavailable")).toBe("danger");
    expect(impactStatusTone("at-risk")).toBe("warning");
    expect(impactStatusTone("impacted")).toBe("danger");
  });
});
