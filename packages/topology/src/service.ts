import { randomUUID } from "node:crypto";
import { hasPermission, type PermissionSubject } from "@dashboard/permissions";
import { wouldCreateCycle } from "./cycle";
import { TopologyError } from "./errors";
import type { TopologyStorePort } from "./ports";
import {
  createDependencySchema,
  deleteDependencySchema,
  getDependencySchema,
  listDependenciesSchema,
  type CreateDependencyInput,
  type DeleteDependencyInput,
  type GetDependencyInput,
  type ListDependenciesInput,
} from "./schemas";
import type { TopologyActor } from "./types";

export type { TopologyActor };

function requireRead(actor: TopologyActor) {
  if (!actor.subject || !hasPermission(actor.subject, "topology.read")) {
    throw new TopologyError("FORBIDDEN", "Missing topology.read");
  }
}

function requireManage(actor: TopologyActor) {
  if (!actor.subject || !hasPermission(actor.subject, "topology.manage")) {
    throw new TopologyError("FORBIDDEN", "Missing topology.manage");
  }
}

export function createTopologyService(deps: { store: TopologyStorePort }) {
  return {
    permissions(actor: TopologyActor) {
      const subject = actor.subject;
      return {
        canRead: Boolean(subject && hasPermission(subject, "topology.read")),
        canManage: Boolean(subject && hasPermission(subject, "topology.manage")),
      };
    },

    async listDependencies(raw: ListDependenciesInput, actor: TopologyActor) {
      requireRead(actor);
      const input = listDependenciesSchema.parse(raw);
      return deps.store.listDependencies({
        ...(input.serviceKeys !== undefined ? { serviceKeys: input.serviceKeys } : {}),
        limit: input.limit,
      });
    },

    async getDependency(raw: GetDependencyInput, actor: TopologyActor) {
      requireRead(actor);
      const input = getDependencySchema.parse(raw);
      const row = await deps.store.getDependency(input.id);
      if (!row) throw new TopologyError("NOT_FOUND", "Dependency not found");
      return row;
    },

    async createDependency(raw: CreateDependencyInput, actor: TopologyActor) {
      requireManage(actor);
      const input = createDependencySchema.parse(raw);
      const [upstreamOk, downstreamOk] = await Promise.all([
        deps.store.integrationExists(input.upstreamServiceKey),
        deps.store.integrationExists(input.downstreamServiceKey),
      ]);
      if (!upstreamOk || !downstreamOk) {
        throw new TopologyError("UNKNOWN_SERVICE", "Unknown upstream or downstream service");
      }
      const existing = await deps.store.listDependencies({ limit: 1_000 });
      if (wouldCreateCycle(existing, input.upstreamServiceKey, input.downstreamServiceKey)) {
        throw new TopologyError("CYCLE", "Dependency would create a cycle");
      }
      const duplicate = existing.find(
        (edge) =>
          edge.upstreamServiceKey === input.upstreamServiceKey &&
          edge.downstreamServiceKey === input.downstreamServiceKey &&
          edge.relationship === input.relationship,
      );
      if (duplicate) {
        throw new TopologyError("CONFLICT", "Dependency already exists");
      }
      try {
        return await deps.store.createDependency({
          id: randomUUID(),
          upstreamServiceKey: input.upstreamServiceKey,
          downstreamServiceKey: input.downstreamServiceKey,
          relationship: input.relationship,
          createdBy: actor.userId,
          now: new Date(),
        });
      } catch (error) {
        if (error instanceof Error && /unique|UNIQUE/i.test(error.message)) {
          throw new TopologyError("CONFLICT", "Dependency already exists");
        }
        throw error;
      }
    },

    async deleteDependency(raw: DeleteDependencyInput, actor: TopologyActor) {
      requireManage(actor);
      const input = deleteDependencySchema.parse(raw);
      const existing = await deps.store.getDependency(input.id);
      if (!existing) throw new TopologyError("NOT_FOUND", "Dependency not found");
      await deps.store.deleteDependency(input.id);
    },
  };
}

export type TopologyService = ReturnType<typeof createTopologyService>;

export type { PermissionSubject };
