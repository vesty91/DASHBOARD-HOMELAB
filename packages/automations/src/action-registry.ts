import { AutomationError } from "./errors";
import { AUTOMATION_ACTION_TYPES, type AutomationActionType } from "./types";

export type AutomationActionRiskLevel = "low" | "high";

export interface AutomationActionPolicy {
  readonly actionType: AutomationActionType;
  readonly automationAllowed: boolean;
  readonly riskLevel: AutomationActionRiskLevel;
  readonly requiresHumanConfirmation: boolean;
  readonly expectedIntegrationType: string;
}

const POLICY_BY_ACTION = {
  "ntfy.publish": {
    automationAllowed: true,
    riskLevel: "low",
    requiresHumanConfirmation: false,
    expectedIntegrationType: "ntfy",
  },
  "qbittorrent.pause": {
    automationAllowed: true,
    riskLevel: "low",
    requiresHumanConfirmation: false,
    expectedIntegrationType: "qbittorrent",
  },
  "qbittorrent.resume": {
    automationAllowed: true,
    riskLevel: "low",
    requiresHumanConfirmation: false,
    expectedIntegrationType: "qbittorrent",
  },
  "sonarr.refresh-series": {
    automationAllowed: true,
    riskLevel: "low",
    requiresHumanConfirmation: false,
    expectedIntegrationType: "sonarr",
  },
  "sonarr.search-episode": {
    automationAllowed: true,
    riskLevel: "low",
    requiresHumanConfirmation: false,
    expectedIntegrationType: "sonarr",
  },
  "radarr.refresh-movie": {
    automationAllowed: true,
    riskLevel: "low",
    requiresHumanConfirmation: false,
    expectedIntegrationType: "radarr",
  },
  "radarr.search-movie": {
    automationAllowed: true,
    riskLevel: "low",
    requiresHumanConfirmation: false,
    expectedIntegrationType: "radarr",
  },
  "proxmox.start": {
    automationAllowed: false,
    riskLevel: "high",
    requiresHumanConfirmation: true,
    expectedIntegrationType: "proxmox",
  },
  "proxmox.shutdown": {
    automationAllowed: false,
    riskLevel: "high",
    requiresHumanConfirmation: true,
    expectedIntegrationType: "proxmox",
  },
  "proxmox.reboot": {
    automationAllowed: false,
    riskLevel: "high",
    requiresHumanConfirmation: true,
    expectedIntegrationType: "proxmox",
  },
  "seerr.approve": {
    automationAllowed: false,
    riskLevel: "high",
    requiresHumanConfirmation: true,
    expectedIntegrationType: "seerr",
  },
  "seerr.decline": {
    automationAllowed: false,
    riskLevel: "high",
    requiresHumanConfirmation: true,
    expectedIntegrationType: "seerr",
  },
} as const satisfies Record<AutomationActionType, Omit<AutomationActionPolicy, "actionType">>;

export function getAutomationActionPolicy(
  actionType: AutomationActionType,
): AutomationActionPolicy {
  const policy = POLICY_BY_ACTION[actionType];
  return { actionType, ...policy };
}

export function isAutomationAllowedAction(actionType: AutomationActionType): boolean {
  return POLICY_BY_ACTION[actionType].automationAllowed;
}

export function assertAutomationActionAllowed(actionType: AutomationActionType): void {
  if (!isAutomationAllowedAction(actionType))
    throw new AutomationError("FORBIDDEN", "Action is not allowed for automations");
}

export function listAutomationAllowedActions(): readonly AutomationActionType[] {
  return AUTOMATION_ACTION_TYPES.filter((action) => POLICY_BY_ACTION[action].automationAllowed);
}
