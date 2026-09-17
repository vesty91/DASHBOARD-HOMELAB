import type { ServiceDependency } from "./types";

export type TopologyStorePort = {
  integrationExists(serviceKey: string): Promise<boolean>;
  listIntegrationIds(limit?: number): Promise<string[]>;
  listOpenUnavailableServiceKeys(): Promise<string[]>;
  listDependencies(input?: {
    serviceKeys?: readonly string[];
    limit?: number;
  }): Promise<ServiceDependency[]>;
  getDependency(id: string): Promise<ServiceDependency | null>;
  createDependency(input: {
    id: string;
    upstreamServiceKey: string;
    downstreamServiceKey: string;
    relationship: "depends_on";
    createdBy: string | null;
    now: Date;
  }): Promise<ServiceDependency>;
  deleteDependency(id: string): Promise<void>;
};
