import type { PermissionSubject } from "@dashboard/permissions";

export const DEPENDENCY_RELATIONSHIPS = ["depends_on"] as const;
export type DependencyRelationship = (typeof DEPENDENCY_RELATIONSHIPS)[number];

export type ServiceDependency = {
  id: string;
  upstreamServiceKey: string;
  downstreamServiceKey: string;
  relationship: DependencyRelationship;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TopologyActor = {
  userId: string | null;
  subject: PermissionSubject | null;
};
