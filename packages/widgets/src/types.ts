import type { z } from "zod";

export interface WidgetSize {
  w: number;
  h: number;
}

export interface WidgetSizing {
  defaultSize: WidgetSize;
  minSize: WidgetSize;
  maxSize: WidgetSize;
}

export type WidgetRuntimeState =
  | "ready"
  | "loading"
  | "empty"
  | "error"
  | "stale"
  | "disconnected"
  | "permission-denied"
  | "configuration-missing";

export type WidgetItemStatus =
  "ready" | "unknown" | "invalid-config" | "incompatible-version" | "configuration-missing";

export type WidgetConfigMigration = (config: unknown) => unknown;

export interface WidgetContract<TConfig = unknown> {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly defaultSize: Readonly<WidgetSize>;
  readonly minSize: Readonly<WidgetSize>;
  readonly maxSize: Readonly<WidgetSize>;
  readonly defaultConfig: TConfig;
  readonly configSchema: z.ZodType<TConfig>;
  readonly publicSafe: boolean;
  readonly migrations?: Readonly<Record<number, WidgetConfigMigration>>;
}

export interface WidgetCatalogEntry {
  id: string;
  version: number;
  name: string;
  description: string;
  category: string;
  defaultSize: WidgetSize;
  minSize: WidgetSize;
  maxSize: WidgetSize;
  publicSafe: boolean;
}

export type WidgetResolveResult =
  | { status: "ready"; config: unknown; version: number; publicSafe: boolean }
  | { status: Exclude<WidgetItemStatus, "ready"> };

export interface WidgetEnginePolicy {
  has(type: string): boolean;
  get(type: string): WidgetContract | undefined;
  getSizing(type: string): WidgetSizing | undefined;
  currentVersion(type: string): number | undefined;
  resolve(
    type: string,
    version: number,
    config: unknown,
    parseFailed?: boolean,
  ): WidgetResolveResult;
  catalog(): readonly WidgetCatalogEntry[];
}
