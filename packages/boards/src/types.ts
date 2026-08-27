import type { PermissionSubject } from "@dashboard/permissions";

export type BoardVisibility = "private" | "authenticated" | "public";
export type BoardResourcePermission = "board.view" | "board.edit" | "board.manage";
export type WidgetItemStatus =
  "ready" | "unknown" | "invalid-config" | "incompatible-version" | "configuration-missing";

export interface BoardRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: BoardVisibility;
  ownerUserId: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface LayoutRecord {
  id: string;
  boardId: string;
  name: string;
  breakpoint: string;
  columns: number;
  rowHeight: number;
  sortOrder: number;
}
export interface PersistedItemRecord {
  id: string;
  boardId: string;
  widgetType: string;
  widgetVersion: number;
  title: string | null;
  configJson: unknown;
  configParseFailed: boolean;
  integrationId: string | null;
}
export interface ItemRecord {
  id: string;
  boardId: string;
  widgetType: string;
  widgetVersion: number;
  title: string | null;
  config: unknown | null;
  runtimeStatus: WidgetItemStatus;
  publicSafe: boolean;
}
export interface PlacementRecord {
  id: string;
  itemId: string;
  layoutId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number | null;
  minH: number | null;
  maxW: number | null;
  maxH: number | null;
}
export interface PersistedBoardSnapshot {
  board: BoardRecord;
  layouts: LayoutRecord[];
  items: PersistedItemRecord[];
  placements: PlacementRecord[];
}
export interface BoardSnapshot {
  board: BoardRecord;
  layouts: LayoutRecord[];
  items: ItemRecord[];
  placements: PlacementRecord[];
}
export interface BoardActor {
  userId: string | null;
  subject: PermissionSubject | null;
}
export interface BoardAccessContext {
  board: BoardRecord;
  actor: BoardActor;
  resourcePermissions: readonly BoardResourcePermission[];
}
export interface LayoutPlacementInput {
  itemId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface WidgetSizing {
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  maxSize: { w: number; h: number };
}
export type WidgetResolveResult =
  | { status: "ready"; config: unknown; version: number; publicSafe: boolean }
  | { status: Exclude<WidgetItemStatus, "ready"> };
export interface BoardWidgetPolicy {
  has(type: string): boolean;
  getSizing(type: string): WidgetSizing | undefined;
  currentVersion(type: string): number | undefined;
  resolve(
    type: string,
    version: number,
    config: unknown,
    parseFailed?: boolean,
  ): WidgetResolveResult;
  catalog(): readonly {
    id: string;
    version: number;
    name: string;
    description: string;
    category: string;
    defaultSize: { w: number; h: number };
    minSize: { w: number; h: number };
    maxSize: { w: number; h: number };
    publicSafe: boolean;
  }[];
}
export interface CreateItemInput {
  boardId: string;
  expectedRevision: number;
  widgetType: string;
  title?: string | null;
  config: unknown;
}
export interface UpdateItemInput {
  boardId: string;
  itemId: string;
  expectedRevision: number;
  title?: string | null;
  config?: unknown;
}
export interface DeleteItemInput {
  boardId: string;
  itemId: string;
  expectedRevision: number;
}
export interface CreateItemPersistence {
  boardId: string;
  expectedRevision: number;
  item: {
    id: string;
    widgetType: string;
    widgetVersion: number;
    title: string | null;
    configJson: unknown;
    integrationId: null;
  };
  placements: readonly {
    layoutId: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW: number | null;
    minH: number | null;
    maxW: number | null;
    maxH: number | null;
  }[];
}
export interface BoardRepository {
  listBoards(): Promise<BoardRecord[]>;
  findSnapshotById(id: string): Promise<PersistedBoardSnapshot | undefined>;
  findSnapshotBySlug(slug: string): Promise<PersistedBoardSnapshot | undefined>;
  resolveResourcePermissions(
    boardId: string,
    userId: string,
  ): Promise<readonly BoardResourcePermission[]>;
  createBoardWithLayouts(input: {
    slug: string;
    name: string;
    description: string | null;
    visibility: BoardVisibility;
    ownerUserId: string;
    layouts: readonly Omit<LayoutRecord, "id" | "boardId">[];
  }): Promise<PersistedBoardSnapshot>;
  updateBoard(input: {
    boardId: string;
    expectedRevision: number;
    name: string;
    description: string | null;
    visibility?: BoardVisibility;
  }): Promise<number>;
  updateLayoutBatch(
    input: {
      boardId: string;
      layoutId: string;
      expectedRevision: number;
      items: readonly LayoutPlacementInput[];
    },
    validateProjected: (columns: number, placements: readonly LayoutPlacementInput[]) => void,
  ): Promise<number>;
  createItem(input: CreateItemPersistence): Promise<number>;
  updateItem(input: {
    boardId: string;
    itemId: string;
    expectedRevision: number;
    title: string | null;
    configJson: unknown;
    widgetVersion: number;
  }): Promise<number>;
  deleteItem(input: { boardId: string; itemId: string; expectedRevision: number }): Promise<number>;
  deleteBoard(boardId: string): Promise<void>;
}
