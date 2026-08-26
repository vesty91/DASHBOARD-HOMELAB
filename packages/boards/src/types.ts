import type { PermissionSubject } from "@dashboard/permissions";
export type BoardVisibility = "private" | "authenticated" | "public";
export type BoardResourcePermission = "board.view" | "board.edit" | "board.manage";
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
export interface ItemRecord {
  id: string;
  boardId: string;
  widgetType: string;
  widgetVersion: number;
  title: string | null;
}
export interface PlacementRecord {
  id: string;
  itemId: string;
  layoutId: string;
  x: number;
  y: number;
  w: number;
  h: number;
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
export interface BoardRepository {
  listBoards(): Promise<BoardRecord[]>;
  findSnapshotById(id: string): Promise<BoardSnapshot | undefined>;
  findSnapshotBySlug(slug: string): Promise<BoardSnapshot | undefined>;
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
  }): Promise<BoardSnapshot>;
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
  deleteBoard(boardId: string): Promise<void>;
}
