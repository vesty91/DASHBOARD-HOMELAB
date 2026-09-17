import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { PageContainer, PageHeader } from "@dashboard/ui";
import { MS_PER_DAY, utcDateString } from "@dashboard/reliability";
import { getBoardCaller } from "@/lib/server/board-api";
import { ReliabilityDetail } from "./reliability-detail";

export const dynamic = "force-dynamic";

export default async function ReliabilityServicePage({
  params,
}: {
  params: Promise<{ serviceKey: string }>;
}) {
  const { serviceKey } = await params;
  const caller = await getBoardCaller();
  const permissions = await caller.reliability.permissions();
  if (!permissions.canRead) redirect("/forbidden");

  try {
    await caller.integration.get({ id: serviceKey });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const nowMs = Date.now();
  const toDate = utcDateString(nowMs);
  const fromDate = utcDateString(nowMs - 89 * MS_PER_DAY);

  const [days, slos, integration] = await Promise.all([
    caller.reliability.listDaily({
      serviceKeys: [serviceKey],
      fromDateUtc: fromDate,
      toDateUtc: toDate,
      limit: 90,
    }),
    caller.reliability.listSlos({ serviceKeys: [serviceKey], limit: 50 }),
    caller.integration.get({ id: serviceKey }),
  ]);

  const evaluations = await Promise.all(
    slos.map(async (slo) => caller.reliability.evaluateSlo({ id: slo.id })),
  );

  const policies =
    slos.length > 0
      ? await caller.reliability.listAlertPolicies({
          sloIds: slos.map((slo) => slo.id),
          limit: 50,
        })
      : [];
  const policyBySloId = new Map(policies.map((policy) => [policy.sloId, policy]));

  const burnEntries = await Promise.all(
    slos.map(async (slo) => {
      const [burn, runtime] = await Promise.all([
        caller.reliability.evaluateBurnRate({ id: slo.id }),
        caller.reliability.getAlertRuntime({ sloId: slo.id }),
      ]);
      const policy = policyBySloId.get(slo.id);
      return [
        slo.id,
        {
          evaluation: burn.evaluation,
          policy: policy
            ? {
                id: policy.id,
                sloId: policy.sloId,
                enabled: policy.enabled,
                warningThreshold: policy.warningThreshold,
                criticalThreshold: policy.criticalThreshold,
                cooldownSeconds: policy.cooldownSeconds,
                notifyOnRecovery: policy.notifyOnRecovery,
                configRevision: policy.configRevision,
                createdAt: policy.createdAt.toISOString(),
                updatedAt: policy.updatedAt.toISOString(),
              }
            : null,
          runtime: runtime
            ? {
                sloId: runtime.sloId,
                lastState: runtime.lastState,
                lastNotifiedState: runtime.lastNotifiedState,
                lastNotifiedAt: runtime.lastNotifiedAt?.toISOString() ?? null,
                lastTransitionAt: runtime.lastTransitionAt?.toISOString() ?? null,
                lastBurnRate: runtime.lastBurnRate,
                updatedAt: runtime.updatedAt.toISOString(),
              }
            : null,
        },
      ] as const;
    }),
  );
  const burnBySloId = Object.fromEntries(burnEntries);

  const serviceLabel = `${integration.name} (${integration.type})`;

  return (
    <PageContainer wide>
      <PageHeader
        title={serviceLabel}
        description="Rollups quotidiens UTC, objectifs SLO, burn-rate et politiques d’alerte."
        actions={
          <Link className="ui-btn ui-btn-ghost" href="/reliability">
            Retour
          </Link>
        }
      />
      <ReliabilityDetail
        serviceKey={serviceKey}
        serviceLabel={serviceLabel}
        days={days}
        slos={slos}
        evaluations={evaluations}
        burnBySloId={burnBySloId}
        canManageSlo={permissions.canManageSlo}
      />
    </PageContainer>
  );
}
