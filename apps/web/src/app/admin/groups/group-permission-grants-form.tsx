import { PERMISSIONS } from "@dashboard/permissions";
import { Button } from "@dashboard/ui";
import { setGroupPermissionGrantsAction } from "./actions";

export function GroupPermissionGrantsForm({
  groupId,
  granted,
}: {
  groupId: string;
  granted: readonly string[];
}) {
  const selected = new Set(granted);
  return (
    <form
      action={setGroupPermissionGrantsAction.bind(null, groupId)}
      className="ui-form ui-card ui-form-card"
    >
      <h3 className="ui-section-title">Permissions supplémentaires</h3>
      <p className="ui-muted">
        Ces permissions s&apos;ajoutent au rôle principal du groupe. Seul l&apos;administrateur
        système peut les modifier.
      </p>
      <div className="ui-form-grid">
        {PERMISSIONS.map((permission) => (
          <label key={permission} className="ui-label">
            <input
              type="checkbox"
              name="permission"
              value={permission}
              defaultChecked={selected.has(permission)}
            />{" "}
            {permission}
          </label>
        ))}
      </div>
      <Button variant="primary" type="submit">
        Enregistrer les permissions
      </Button>
    </form>
  );
}
