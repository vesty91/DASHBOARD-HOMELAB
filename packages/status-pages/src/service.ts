import { hasPermission, type PermissionSubject } from "@dashboard/permissions";
import { StatusPageError } from "./errors";
import { pickOverallStatus, resolvePublicServiceStatus } from "./status-map";
import type {
  ManagedStatusPageDto,
  ManagedStatusServiceDto,
  PublicStatusPageDto,
  PublicStatusServiceDto,
  StatusPageActor,
  StatusPageRecord,
  StatusPageServiceRecord,
  StatusPageSnapshot,
  StatusPageStorePort,
} from "./types";

function assertPublicDtoSafe(dto: PublicStatusPageDto): void {
  const serialized = JSON.stringify(dto);
  if (
    /sourceIntegrationId|baseUrl|ciphertext|password|token|api[_-]?key|https?:\/\//iu.test(
      serialized,
    )
  ) {
    throw new StatusPageError("VALIDATION_ERROR", "Public DTO must not leak internals");
  }
}

export function toPublicStatusPageDto(
  snapshot: StatusPageSnapshot,
  serviceStatuses: readonly PublicStatusServiceDto[],
): PublicStatusPageDto {
  const dto: PublicStatusPageDto = {
    id: snapshot.page.id,
    name: snapshot.page.name,
    slug: snapshot.page.slug,
    description: snapshot.page.description,
    overallStatus: pickOverallStatus(serviceStatuses.map((service) => service.status)),
    services: serviceStatuses,
    updatedAt: snapshot.page.updatedAt.toISOString(),
  };
  assertPublicDtoSafe(dto);
  return dto;
}

export function toManagedStatusPageDto(
  snapshot: StatusPageSnapshot,
  serviceStatuses: readonly ManagedStatusServiceDto[],
): ManagedStatusPageDto {
  return {
    id: snapshot.page.id,
    name: snapshot.page.name,
    slug: snapshot.page.slug,
    description: snapshot.page.description,
    visibility: snapshot.page.visibility,
    enabled: snapshot.page.enabled,
    configRevision: snapshot.page.configRevision,
    createdBy: snapshot.page.createdBy,
    createdAt: snapshot.page.createdAt.toISOString(),
    updatedAt: snapshot.page.updatedAt.toISOString(),
    overallStatus: pickOverallStatus(serviceStatuses.map((service) => service.status)),
    services: serviceStatuses,
  };
}

export function isPubliclyReadable(page: StatusPageRecord): boolean {
  return page.visibility === "public" && page.enabled;
}

function requireActive(actor: StatusPageActor): asserts actor is StatusPageActor & {
  userId: string;
  subject: PermissionSubject;
} {
  if (!actor.userId || !actor.subject || actor.subject.status !== "active") {
    throw new StatusPageError("UNAUTHORIZED", "Authentication required");
  }
}

function requireStatusPagePermission(
  actor: StatusPageActor,
  permission: "status-page.read" | "status-page.manage",
): void {
  requireActive(actor);
  if (permission === "status-page.read") {
    if (
      hasPermission(actor.subject, "status-page.read") ||
      hasPermission(actor.subject, "status-page.manage")
    ) {
      return;
    }
    throw new StatusPageError("DENIED_PERMISSION", "Permission denied");
  }
  if (!hasPermission(actor.subject, permission)) {
    throw new StatusPageError("DENIED_PERMISSION", "Permission denied");
  }
}

export async function projectServiceStatuses(
  store: StatusPageStorePort,
  services: readonly StatusPageServiceRecord[],
): Promise<{
  publicServices: PublicStatusServiceDto[];
  managedServices: ManagedStatusServiceDto[];
}> {
  const integrationIds = services.map((service) => service.sourceIntegrationId);
  const [statuses, openIncidents, activeMaintenance] = await Promise.all([
    store.findIntegrationStatuses(integrationIds),
    store.listOpenAvailabilityIncidentIntegrationIds(integrationIds),
    store.listActiveMaintenanceIntegrationIds(integrationIds),
  ]);

  const publicServices: PublicStatusServiceDto[] = [];
  const managedServices: ManagedStatusServiceDto[] = [];

  for (const service of services) {
    const integration = statuses.get(service.sourceIntegrationId) ?? null;
    const status = resolvePublicServiceStatus({
      integrationStatus: integration?.status ?? null,
      hasOpenAvailabilityIncident: openIncidents.has(service.sourceIntegrationId),
      hasActiveMaintenance: activeMaintenance.has(service.sourceIntegrationId),
    });
    publicServices.push({
      id: service.id,
      displayName: service.displayName,
      description: service.description,
      sortOrder: service.sortOrder,
      status,
      showIncidentHistory: service.showIncidentHistory,
    });
    managedServices.push({
      id: service.id,
      displayName: service.displayName,
      description: service.description,
      sortOrder: service.sortOrder,
      showIncidentHistory: service.showIncidentHistory,
      sourceIntegrationId: service.sourceIntegrationId,
      status,
    });
  }

  return { publicServices, managedServices };
}

export interface StatusPageServiceDeps {
  store: StatusPageStorePort;
  publicCache?: {
    get(key: string): PublicStatusPageDto | null;
    set(key: string, value: PublicStatusPageDto): void;
    invalidate(key: string): void;
  };
  now?: () => Date;
}

export type StatusPageService = ReturnType<typeof createStatusPageService>;

export function createStatusPageService(deps: StatusPageServiceDeps) {
  const now = deps.now ?? (() => new Date());

  async function requireManagedSnapshot(id: string): Promise<StatusPageSnapshot> {
    const snapshot = await deps.store.findSnapshotById(id);
    if (!snapshot) throw new StatusPageError("NOT_FOUND", "Status page not found");
    return snapshot;
  }

  async function toManaged(snapshot: StatusPageSnapshot): Promise<ManagedStatusPageDto> {
    const projected = await projectServiceStatuses(deps.store, snapshot.services);
    return toManagedStatusPageDto(snapshot, projected.managedServices);
  }

  return {
    permissions(actor: StatusPageActor) {
      const subject = actor.subject;
      const active = Boolean(subject && subject.status === "active");
      return {
        canRead: Boolean(
          active &&
          subject &&
          (hasPermission(subject, "status-page.read") ||
            hasPermission(subject, "status-page.manage")),
        ),
        canManage: Boolean(active && subject && hasPermission(subject, "status-page.manage")),
      };
    },

    async list(actor: StatusPageActor): Promise<ManagedStatusPageDto[]> {
      requireStatusPagePermission(actor, "status-page.read");
      const pages = await deps.store.listPages();
      const result: ManagedStatusPageDto[] = [];
      for (const page of pages) {
        const snapshot = await deps.store.findSnapshotById(page.id);
        if (!snapshot) continue;
        result.push(await toManaged(snapshot));
      }
      return result;
    },

    async get(id: string, actor: StatusPageActor): Promise<ManagedStatusPageDto> {
      requireStatusPagePermission(actor, "status-page.read");
      return toManaged(await requireManagedSnapshot(id));
    },

    async create(
      input: {
        name: string;
        slug: string;
        description: string | null;
        visibility: "private" | "public";
        enabled: boolean;
      },
      actor: StatusPageActor,
    ): Promise<ManagedStatusPageDto> {
      requireStatusPagePermission(actor, "status-page.manage");
      const existing = await deps.store.findPageBySlug(input.slug);
      if (existing) throw new StatusPageError("CONFLICT", "Status page slug already exists");
      const created = await deps.store.createPage({
        ...input,
        createdBy: actor.userId,
        now: now(),
      });
      return toManaged({ page: created, services: [] });
    },

    async update(
      input: {
        id: string;
        expectedConfigRevision: number;
        name: string;
        slug: string;
        description: string | null;
        visibility: "private" | "public";
        enabled: boolean;
      },
      actor: StatusPageActor,
    ): Promise<ManagedStatusPageDto> {
      requireStatusPagePermission(actor, "status-page.manage");
      const current = await deps.store.findPageById(input.id);
      if (!current) throw new StatusPageError("NOT_FOUND", "Status page not found");
      if (input.slug !== current.slug) {
        const collision = await deps.store.findPageBySlug(input.slug);
        if (collision) throw new StatusPageError("CONFLICT", "Status page slug already exists");
      }
      const updated = await deps.store.updatePage({ ...input, now: now() });
      deps.publicCache?.invalidate(updated.id);
      return toManaged(await requireManagedSnapshot(updated.id));
    },

    async delete(
      input: { id: string; expectedConfigRevision: number },
      actor: StatusPageActor,
    ): Promise<void> {
      requireStatusPagePermission(actor, "status-page.manage");
      await deps.store.deletePage(input.id, input.expectedConfigRevision);
      deps.publicCache?.invalidate(input.id);
    },

    async replaceServices(
      input: {
        statusPageId: string;
        expectedConfigRevision: number;
        services: readonly {
          sourceIntegrationId: string;
          displayName: string;
          description: string | null;
          sortOrder: number;
          showIncidentHistory: boolean;
        }[];
      },
      actor: StatusPageActor,
    ): Promise<ManagedStatusPageDto> {
      requireStatusPagePermission(actor, "status-page.manage");
      const snapshot = await deps.store.replaceServices({ ...input, now: now() });
      deps.publicCache?.invalidate(snapshot.page.id);
      return toManaged(snapshot);
    },

    async getPublicBySlug(slug: string): Promise<PublicStatusPageDto> {
      const snapshot = await deps.store.findSnapshotBySlug(slug);
      if (!snapshot || !isPubliclyReadable(snapshot.page)) {
        throw new StatusPageError("NOT_FOUND", "Status page not found");
      }
      const cacheKey = snapshot.page.id;
      const cached = deps.publicCache?.get(cacheKey);
      if (cached) return cached;
      const projected = await projectServiceStatuses(deps.store, snapshot.services);
      const dto = toPublicStatusPageDto(snapshot, projected.publicServices);
      deps.publicCache?.set(cacheKey, dto);
      return dto;
    },
  };
}
