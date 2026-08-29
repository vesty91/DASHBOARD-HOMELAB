export const APP_LIBRARY_CATEGORIES = [
  "media",
  "downloads",
  "automation",
  "monitoring",
  "infrastructure",
  "network",
  "storage",
  "security",
  "home-automation",
  "productivity",
  "development",
  "other",
] as const;

export type AppLibraryCategory = (typeof APP_LIBRARY_CATEGORIES)[number];

export const LOCAL_APP_ICON_PATH = /^\/app-icons\/[a-z0-9]+(?:-[a-z0-9]+)*\.(svg|png|webp)$/;

export const APP_LIFECYCLE_STATUSES = ["active", "legacy", "retired"] as const;

export type AppLifecycleStatus = (typeof APP_LIFECYCLE_STATUSES)[number];

export interface AppLifecycle {
  readonly status: AppLifecycleStatus;
  readonly replacedBy?: string;
  readonly note?: string;
}

export interface AppDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: AppLibraryCategory;
  readonly icon: {
    readonly path: string;
    readonly source: "dashboard-icons" | "internal";
  };
  readonly tags: readonly string[];
  readonly website?: string;
  readonly documentation?: string;
  readonly defaults?: {
    readonly protocol?: "http" | "https";
    readonly port?: number;
    readonly path?: string;
    readonly target?: "same-tab" | "new-tab";
  };
  readonly health?: {
    readonly suggestedPath?: string;
    readonly suggestedMethod?: "GET" | "HEAD";
  };
  readonly discovery?: {
    readonly dockerImages?: readonly string[];
    readonly containerNames?: readonly string[];
  };
  readonly futureIntegrationType?: string;
  readonly lifecycle?: AppLifecycle;
}

export interface AppLibraryView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: AppLibraryCategory;
  readonly icon: {
    readonly path: string;
    readonly source: "dashboard-icons" | "internal";
  };
  readonly tags: readonly string[];
  readonly website?: string;
  readonly documentation?: string;
  readonly defaults?: {
    readonly protocol?: "http" | "https";
    readonly port?: number;
    readonly path?: string;
    readonly target?: "same-tab" | "new-tab";
    readonly urlPlaceholder?: string;
  };
  readonly health?: {
    readonly suggestedPath?: string;
    readonly suggestedMethod?: "GET" | "HEAD";
  };
  readonly discovery?: {
    readonly dockerImages?: readonly string[];
    readonly containerNames?: readonly string[];
  };
  readonly futureIntegrationType?: string;
  readonly lifecycle: {
    readonly status: AppLifecycleStatus;
    readonly replacedBy?: string;
    readonly replacedByName?: string;
    readonly note?: string;
  };
}
