"use client";

import { useCallback, useEffect, useState } from "react";
import type { PushSubscriptionView } from "@dashboard/notifications";
import { Badge, Button } from "@dashboard/ui";
import {
  getPushPermissionsAction,
  getPushVapidPublicKeyAction,
  listPushSubscriptionsAction,
  subscribePushAction,
  unsubscribeAllPushAction,
  unsubscribePushAction,
} from "./push-actions";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashEndpoint(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isIosLike(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const iosStandalone =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return media || iosStandalone;
}

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function summarizeUserAgent(userAgent: string | null): string {
  if (!userAgent?.trim()) return "Appareil inconnu";
  const value = userAgent.trim();
  if (value.length <= 72) return value;
  return `${value.slice(0, 69)}…`;
}

export function PushPreferencesPanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [canRead, setCanRead] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [vapidConfigured, setVapidConfigured] = useState(false);
  const [items, setItems] = useState<PushSubscriptionView[]>([]);
  const [currentEndpointHash, setCurrentEndpointHash] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const permissions = await getPushPermissionsAction();
      setCanRead(permissions.canRead);
      setCanManage(permissions.canManage);
      setVapidConfigured(permissions.vapidConfigured);
      if (!permissions.canRead) {
        setItems([]);
        return;
      }
      const listed = await listPushSubscriptionsAction();
      setItems(listed.items);
      if (pushSupported()) {
        setPermission(Notification.permission);
        const registration = await navigator.serviceWorker.ready.catch(() => null);
        const current = await registration?.pushManager.getSubscription();
        if (current?.endpoint) {
          setCurrentEndpointHash(await hashEndpoint(current.endpoint));
        } else {
          setCurrentEndpointHash(null);
        }
      } else {
        setPermission("unsupported");
        setCurrentEndpointHash(null);
      }
    } catch {
      setError("Impossible de charger les abonnements push.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#push") return;
    document.getElementById("push")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading]);

  async function enablePush(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!pushSupported()) {
        setError("Ce navigateur ne prend pas en charge Web Push.");
        return;
      }
      if (isIosLike() && !isStandaloneDisplay()) {
        setError(
          "Sur iOS, Web Push nécessite l’app ajoutée à l’écran d’accueil (PWA installée), pas Safari en onglet.",
        );
        return;
      }
      const publicKey = await getPushVapidPublicKeyAction();
      if (!publicKey) {
        setError("Web Push n’est pas configuré sur ce serveur (clés VAPID manquantes).");
        return;
      }
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") {
        setError("Permission de notification refusée.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const p256dh = subscription.getKey("p256dh");
      const auth = subscription.getKey("auth");
      if (!p256dh || !auth) {
        setError("Impossible de lire les clés de souscription push.");
        return;
      }
      const result = await subscribePushAction({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: bufferToBase64Url(p256dh),
          auth: bufferToBase64Url(auth),
        },
        userAgent: navigator.userAgent,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage("Notifications push activées sur cet appareil.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Activation push impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function disableCurrentDevice(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!pushSupported()) {
        setError("Ce navigateur ne prend pas en charge Web Push.");
        return;
      }
      const registration = await navigator.serviceWorker.ready.catch(() => null);
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        setError("Aucun abonnement push local sur cet appareil.");
        return;
      }
      const result = await unsubscribePushAction({ endpoint: subscription.endpoint });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await subscription.unsubscribe().catch(() => undefined);
      setMessage("Push désactivé sur cet appareil.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Désactivation impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function disableDevice(id: string): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await unsubscribePushAction({ id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (pushSupported()) {
        const registration = await navigator.serviceWorker.ready.catch(() => null);
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription && currentEndpointHash) {
          const hash = await hashEndpoint(subscription.endpoint);
          if (hash === currentEndpointHash) {
            await subscription.unsubscribe().catch(() => undefined);
          }
        }
      }
      setMessage("Appareil retiré.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Désactivation impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function disableAllDevices(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await unsubscribeAllPushAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (pushSupported()) {
        const registration = await navigator.serviceWorker.ready.catch(() => null);
        const subscription = await registration?.pushManager.getSubscription();
        await subscription?.unsubscribe().catch(() => undefined);
      }
      setMessage(
        result.removed > 0
          ? `${result.removed} abonnement(s) push désactivé(s).`
          : "Aucun abonnement push actif.",
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Désactivation impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!canRead && !loading) return null;

  const iosHint = isIosLike() && !isStandaloneDisplay();
  const canEnable =
    canManage && vapidConfigured && pushSupported() && permission !== "denied" && !iosHint;

  return (
    <section id="push" className="ui-card ui-form-card" data-testid="push-preferences-panel">
      <h2 className="ui-section-title">Notifications push</h2>
      <p className="ui-muted">
        Opt-in uniquement. Les payloads lock-screen restent minimaux par défaut (titre générique «
        Restor_Pc », sans titres métier, emails ni détails sensibles).
      </p>
      <p className="ui-muted">
        Installation PWA : Chromium / Edge propose l’installation via l’UI du navigateur ; sur iOS
        Safari, utilisez « Sur l’écran d’accueil ». Aucun bouton Install universel n’est exposé —
        les APIs diffèrent selon la plateforme.
      </p>
      {iosHint ? (
        <p className="ui-muted" data-testid="push-ios-install-hint">
          Sur iOS, Web Push (lorsqu’il est supporté) exige une PWA installée sur l’écran d’accueil,
          pas une session Safari en onglet seul.
        </p>
      ) : null}
      {!vapidConfigured && canRead ? (
        <p className="ui-muted" data-testid="push-vapid-missing">
          Web Push n’est pas configuré côté serveur (variables VAPID).
        </p>
      ) : null}
      {permission === "unsupported" ? (
        <p className="ui-muted" data-testid="push-unsupported">
          Ce navigateur ne prend pas en charge PushManager / Notification.
        </p>
      ) : null}
      {loading ? <p className="ui-muted">Chargement…</p> : null}
      {error ? (
        <p className="notification-center-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="ui-muted" data-testid="push-status-message">
          {message}
        </p>
      ) : null}
      {canManage ? (
        <div className="push-preferences-actions" style={{ margin: "0.75rem 0" }}>
          <Button
            type="button"
            variant="primary"
            disabled={busy || !canEnable}
            data-testid="push-enable"
            onClick={() => void enablePush()}
          >
            Activer sur cet appareil
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !pushSupported()}
            data-testid="push-disable-current"
            onClick={() => void disableCurrentDevice()}
          >
            Désactiver cet appareil
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={busy || items.length === 0}
            data-testid="push-disable-all"
            onClick={() => void disableAllDevices()}
          >
            Désactiver tous les appareils
          </Button>
        </div>
      ) : null}
      {!loading && items.length === 0 ? (
        <p className="ui-muted" data-testid="push-empty">
          Aucun appareil abonné.
        </p>
      ) : null}
      {items.length > 0 ? (
        <div className="ui-table-wrap">
          <table className="ui-table" data-testid="push-subscriptions-table">
            <thead>
              <tr>
                <th>Appareil</th>
                <th>Créé</th>
                <th>État</th>
                <th className="ui-table-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const current =
                  currentEndpointHash != null && item.endpointHash === currentEndpointHash;
                return (
                  <tr key={item.id} data-testid={`push-subscription-${item.id}`}>
                    <td>{summarizeUserAgent(item.userAgent)}</td>
                    <td>{item.createdAt}</td>
                    <td>
                      {current ? (
                        <Badge tone="success">Cet appareil</Badge>
                      ) : (
                        <Badge tone="warning">Autre appareil</Badge>
                      )}
                    </td>
                    <td className="ui-table-actions">
                      {canManage ? (
                        <button
                          type="button"
                          className="ui-btn-ghost"
                          disabled={busy}
                          data-testid={`push-disable-${item.id}`}
                          onClick={() => void disableDevice(item.id)}
                        >
                          Désactiver
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
