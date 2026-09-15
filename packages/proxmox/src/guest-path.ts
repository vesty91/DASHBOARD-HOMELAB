import {
  IntegrationError,
  assertSafePathSegment,
  joinAllowlistedPath,
} from "@dashboard/integrations";
import type { ProxmoxGuestPowerAction, ProxmoxGuestType } from "./types";

export const PROXMOX_VMID_MIN = 1;
export const PROXMOX_VMID_MAX = 999_999_999;

const NODE_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,61}[A-Za-z0-9])?$/u;
const GUEST_STATUS_CURRENT = /^\/api2\/json\/nodes\/([^/]+)\/(qemu|lxc)\/(\d+)\/status\/current$/u;
const GUEST_POWER_ACTION =
  /^\/api2\/json\/nodes\/([^/]+)\/(qemu|lxc)\/(\d+)\/status\/(start|shutdown|reboot)$/u;

export function assertProxmoxNodeName(value: string): string {
  if (!NODE_PATTERN.test(value))
    throw new IntegrationError("VALIDATION_ERROR", "Invalid Proxmox node name");
  return assertSafePathSegment(value, "Proxmox node");
}

export function assertProxmoxVmid(value: number): number {
  if (!Number.isInteger(value) || value < PROXMOX_VMID_MIN || value > PROXMOX_VMID_MAX)
    throw new IntegrationError("VALIDATION_ERROR", "Invalid Proxmox VMID");
  return value;
}

export function assertProxmoxGuestType(value: string): ProxmoxGuestType {
  if (value !== "qemu" && value !== "lxc")
    throw new IntegrationError("VALIDATION_ERROR", "Invalid Proxmox guest type");
  return value;
}

export function assertProxmoxGuestPowerAction(value: string): ProxmoxGuestPowerAction {
  if (value !== "start" && value !== "shutdown" && value !== "reboot")
    throw new IntegrationError("VALIDATION_ERROR", "Invalid Proxmox guest action");
  return value;
}

export function proxmoxGuestStatusCurrentPath(
  node: string,
  guestType: ProxmoxGuestType,
  vmid: number,
): string {
  return joinAllowlistedPath([
    "api2",
    "json",
    "nodes",
    assertProxmoxNodeName(node),
    guestType,
    String(assertProxmoxVmid(vmid)),
    "status",
    "current",
  ]);
}

export function proxmoxGuestPowerPath(
  node: string,
  guestType: ProxmoxGuestType,
  vmid: number,
  action: ProxmoxGuestPowerAction,
): string {
  return joinAllowlistedPath([
    "api2",
    "json",
    "nodes",
    assertProxmoxNodeName(node),
    guestType,
    String(assertProxmoxVmid(vmid)),
    "status",
    action,
  ]);
}

export function isProxmoxGuestStatusCurrentPath(pathname: string): boolean {
  const match = GUEST_STATUS_CURRENT.exec(pathname);
  if (!match || !match[1] || !match[2] || !match[3]) return false;
  try {
    assertProxmoxNodeName(match[1]);
    assertProxmoxGuestType(match[2]);
    assertProxmoxVmid(Number(match[3]));
    return true;
  } catch {
    return false;
  }
}

export function isProxmoxGuestPowerPath(pathname: string): boolean {
  const match = GUEST_POWER_ACTION.exec(pathname);
  if (!match || !match[1] || !match[2] || !match[3] || !match[4]) return false;
  try {
    assertProxmoxNodeName(match[1]);
    assertProxmoxGuestType(match[2]);
    assertProxmoxVmid(Number(match[3]));
    assertProxmoxGuestPowerAction(match[4]);
    return true;
  } catch {
    return false;
  }
}

export function proxmoxGuestResourceId(
  node: string,
  guestType: ProxmoxGuestType,
  vmid: number,
): string {
  return `${assertProxmoxNodeName(node)}-${guestType}-${assertProxmoxVmid(vmid)}`;
}
