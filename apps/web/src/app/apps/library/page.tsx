import { redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@dashboard/ui";
import { usedAppLibraryCategories } from "@dashboard/app-library";
import { getBoardCaller } from "../../../lib/server/board-api";
import { LibraryBrowser } from "./library-browser";

export default async function AppLibraryPage() {
  const caller = await getBoardCaller();
  try {
    const [items, canManage] = await Promise.all([
      caller.app.library.list(),
      caller.app.canManage(),
    ]);
    return (
      <PageContainer wide>
        <PageHeader
          title="Bibliothèque d'applications"
          description="Ajoutez rapidement vos services à partir d'un catalogue."
        />
        <LibraryBrowser
          items={items}
          categories={usedAppLibraryCategories()}
          canManage={canManage}
        />
      </PageContainer>
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "UNAUTHORIZED")
      redirect("/login");
    if (error && typeof error === "object" && "code" in error && error.code === "FORBIDDEN")
      redirect("/forbidden");
    throw error;
  }
}
