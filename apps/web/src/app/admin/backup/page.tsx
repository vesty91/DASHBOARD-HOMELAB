import { PageContainer, PageHeader } from "@dashboard/ui";
import { requireAdminPagePermission } from "@/lib/server/auth";
import { BackupConsole } from "./backup-console";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  await requireAdminPagePermission("backup.manage");
  return (
    <PageContainer>
      <PageHeader
        title="Backup"
        description="Exporter un manifeste versionné, valider une archive sans mutation, puis restaurer."
      />
      <BackupConsole />
    </PageContainer>
  );
}
