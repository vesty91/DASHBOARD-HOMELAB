export {
  analyzeImpact,
  ACTUAL_STATUSES,
  IMPACT_STATUSES,
  type ActualStatus,
  type ImpactStatus,
  type ImpactAnalysis,
  type ServiceImpactView,
} from "./impact";
export {
  wouldCreateCycle,
  buildDownstreamAdjacency,
  TOPOLOGY_MAX_DEPTH,
  TOPOLOGY_MAX_NODES,
} from "./cycle";
export { TopologyError } from "./errors";
export type { TopologyStorePort } from "./ports";
export {
  analyzeImpactSchema,
  createDependencySchema,
  deleteDependencySchema,
  getDependencySchema,
  listDependenciesSchema,
  type AnalyzeImpactInput,
  type CreateDependencyInput,
  type DeleteDependencyInput,
  type GetDependencyInput,
  type ListDependenciesInput,
} from "./schemas";
export { createTopologyService, type TopologyService, type TopologyActor } from "./service";
export {
  DEPENDENCY_RELATIONSHIPS,
  type DependencyRelationship,
  type ServiceDependency,
} from "./types";
export {
  computeImpactAnalysis,
  createImpactEventReconciler,
  diffImpactTransitions,
  type DependencyImpactChangedEvent,
  type ImpactEventReconciler,
} from "./impact-events";
