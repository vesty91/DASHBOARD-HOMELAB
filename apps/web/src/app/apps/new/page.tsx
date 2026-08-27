import { redirect } from "next/navigation";
import { getBoardCaller } from "../../../lib/server/board-api";
import { createAppAction } from "../actions";
import { AppForm } from "../app-form";
export default async function NewAppPage() {
  if (!(await (await getBoardCaller()).app.canManage())) redirect("/forbidden");
  return (
    <main>
      <h1>Ajouter une App</h1>
      <AppForm action={createAppAction} />
    </main>
  );
}
