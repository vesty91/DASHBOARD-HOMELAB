"use client";

import { useState } from "react";
import { Alert, ConfirmDialog } from "@dashboard/ui";
import {
  rebootProxmoxGuestAction,
  shutdownProxmoxGuestAction,
  startProxmoxGuestAction,
} from "./proxmox-actions";
import type { ProxmoxActionOutcome } from "./proxmox-action-result";
import type { ProxmoxGuestType } from "@dashboard/proxmox";

type PendingAction = "shutdown" | "reboot";

export function ProxmoxGuestActions({
  integrationId,
  canStart,
  canShutdown,
  canReboot,
}: {
  integrationId: string;
  canStart: boolean;
  canShutdown: boolean;
  canReboot: boolean;
}) {
  const [node, setNode] = useState("");
  const [guestType, setGuestType] = useState<ProxmoxGuestType>("qemu");
  const [vmid, setVmid] = useState("100");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canStart && !canShutdown && !canReboot) return null;

  function parsedInput() {
    const trimmedNode = node.trim();
    const parsedVmid = Number(vmid);
    return { integrationId, node: trimmedNode, guestType, vmid: parsedVmid };
  }

  async function runAction(action: () => Promise<ProxmoxActionOutcome>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      if (result.ok) setMessage("Action Proxmox envoyée.");
      else setError(result.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="proxmox-guest-actions">
      <h2>Actions d&apos;invité</h2>
      <p className="ui-muted">
        Saisissez le nœud, le type (QEMU ou LXC) et le VMID. Les noms d&apos;invités ne sont pas
        listés.
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
      <label>
        Nœud
        <input
          value={node}
          onChange={(event) => setNode(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
      </label>
      <label>
        Type
        <select
          value={guestType}
          onChange={(event) => setGuestType(event.target.value as ProxmoxGuestType)}
          disabled={busy}
        >
          <option value="qemu">QEMU (VM)</option>
          <option value="lxc">LXC (CT)</option>
        </select>
      </label>
      <label>
        VMID
        <input
          type="number"
          min={1}
          max={999999999}
          step={1}
          value={vmid}
          onChange={(event) => setVmid(event.target.value)}
          disabled={busy}
        />
      </label>
      <div className="proxmox-toolbar">
        {canStart ? (
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            disabled={busy}
            onClick={() => void runAction(() => startProxmoxGuestAction(parsedInput()))}
          >
            Démarrer
          </button>
        ) : null}
        {canShutdown ? (
          <button
            type="button"
            className="ui-btn"
            disabled={busy}
            onClick={() => setPending("shutdown")}
          >
            Arrêter
          </button>
        ) : null}
        {canReboot ? (
          <button
            type="button"
            className="ui-btn"
            disabled={busy}
            onClick={() => setPending("reboot")}
          >
            Redémarrer
          </button>
        ) : null}
      </div>
      {pending === "shutdown" ? (
        <ConfirmDialog
          title="Arrêter l'invité Proxmox ?"
          confirmLabel="Arrêter"
          onConfirm={() => {
            setPending(null);
            void runAction(() => shutdownProxmoxGuestAction(parsedInput()));
          }}
          onCancel={() => setPending(null)}
        >
          Un arrêt ACPI est envoyé à la VM ou au CT identifié par nœud, type et VMID.
        </ConfirmDialog>
      ) : null}
      {pending === "reboot" ? (
        <ConfirmDialog
          title="Redémarrer l'invité Proxmox ?"
          confirmLabel="Redémarrer"
          onConfirm={() => {
            setPending(null);
            void runAction(() => rebootProxmoxGuestAction(parsedInput()));
          }}
          onCancel={() => setPending(null)}
        >
          Un reboot ACPI est envoyé à la VM ou au CT identifié par nœud, type et VMID.
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
