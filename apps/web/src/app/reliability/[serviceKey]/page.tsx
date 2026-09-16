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

  const serviceLabel = `${integration.name} (${integration.type})`;

  return (
    <PageContainer wide>
      <PageHeader
        title={serviceLabel}
        description="Rollups quotidiens UTC, objectifs SLO et export CSV."
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
        canManageSlo={permissions.canManageSlo}
      />
    </PageContainer>
  );
}
