import { randomUUID } from "node:crypto";
import { hasPermission, type PermissionSubject } from "@dashboard/permissions";
import {
  decryptPushSubscriptionField,
  encryptPushSubscriptionField,
  type SecretKeyring,
} from "@dashboard/secrets";
import { NotificationError } from "./errors";
import { buildSafePushPayload, hashPushEndpoint } from "./push-payload";
import {
  parsePushSubscribeInput,
  parsePushUnsubscribeInput,
  type PushSubscribeInput,
} from "./push-schemas";
import {
  PUSH_MAX_SUBSCRIPTIONS_PER_USER,
  type PushSubscriptionRecord,
  type PushSubscriptionStorePort,
  type PushSubscriptionView,
} from "./push-types";
import type { NotificationActor, NotificationRecord } from "./service";

export type WebPushVapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export type WebPushSendResult = {
  statusCode?: number;
  body?: string;
};

export type WebPushSender = (input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  payload: string;
  vapid: WebPushVapidConfig;
}) => Promise<WebPushSendResult>;

export type PushService = ReturnType<typeof createPushService>;

function requireActive(actor: NotificationActor): asserts actor is NotificationActor & {
  userId: string;
  subject: PermissionSubject;
} {
  if (!actor.userId || !actor.subject || actor.subject.status !== "active")
    throw new NotificationError("FORBIDDEN", "Authentication required");
}

function requireSelfPermission(
  actor: NotificationActor,
  permission: "notification.read.self" | "notification.manage.self",
): void {
  requireActive(actor);
  if (!hasPermission(actor.subject, permission))
    throw new NotificationError("DENIED_PERMISSION", "Permission denied");
}

function toView(row: PushSubscriptionRecord): PushSubscriptionView {
  return {
    id: row.id,
    endpointHash: row.endpointHash,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function encryptFields(
  keyring: SecretKeyring,
  input: {
    userId: string;
    subscriptionId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  },
) {
  const endpoint = encryptPushSubscriptionField(keyring, {
    userId: input.userId,
    subscriptionId: input.subscriptionId,
    field: "endpoint",
    plaintext: input.endpoint,
  });
  const p256dh = encryptPushSubscriptionField(keyring, {
    userId: input.userId,
    subscriptionId: input.subscriptionId,
    field: "p256dh",
    plaintext: input.p256dh,
  });
  const auth = encryptPushSubscriptionField(keyring, {
    userId: input.userId,
    subscriptionId: input.subscriptionId,
    field: "auth",
    plaintext: input.auth,
  });
  return {
    endpoint: {
      ciphertext: endpoint.ciphertext,
      iv: endpoint.iv,
      authTag: endpoint.authTag,
    },
    p256dh: {
      ciphertext: p256dh.ciphertext,
      iv: p256dh.iv,
      authTag: p256dh.authTag,
    },
    auth: {
      ciphertext: auth.ciphertext,
      iv: auth.iv,
      authTag: auth.authTag,
    },
    keyVersion: endpoint.keyVersion,
  };
}

function decryptKeys(keyring: SecretKeyring, row: PushSubscriptionRecord) {
  return {
    endpoint: decryptPushSubscriptionField(keyring, {
      userId: row.userId,
      subscriptionId: row.id,
      field: "endpoint",
      ciphertext: row.endpoint.ciphertext,
      iv: row.endpoint.iv,
      authTag: row.endpoint.authTag,
      keyVersion: row.keyVersion,
    }),
    p256dh: decryptPushSubscriptionField(keyring, {
      userId: row.userId,
      subscriptionId: row.id,
      field: "p256dh",
      ciphertext: row.p256dh.ciphertext,
      iv: row.p256dh.iv,
      authTag: row.p256dh.authTag,
      keyVersion: row.keyVersion,
    }),
    auth: decryptPushSubscriptionField(keyring, {
      userId: row.userId,
      subscriptionId: row.id,
      field: "auth",
      ciphertext: row.auth.ciphertext,
      iv: row.auth.iv,
      authTag: row.auth.authTag,
      keyVersion: row.keyVersion,
    }),
  };
}

function isGoneStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

function isTransientStatus(statusCode: number | undefined): boolean {
  if (statusCode == null) return true;
  return statusCode === 429 || statusCode >= 500;
}

export function createPushService(deps: {
  store: PushSubscriptionStorePort;
  keyring: SecretKeyring | undefined;
  vapid: Partial<WebPushVapidConfig> | undefined;
  send: WebPushSender;
  logger?: {
    warn(message: string, meta?: Record<string, unknown>): void;
  };
}) {
  function requireVapidConfigured(): WebPushVapidConfig {
    const publicKey = deps.vapid?.publicKey?.trim();
    const privateKey = deps.vapid?.privateKey?.trim();
    const subject = deps.vapid?.subject?.trim();
    if (!publicKey || !privateKey || !subject)
      throw new NotificationError("MISCONFIGURED", "Web Push VAPID is not fully configured");
    return { publicKey, privateKey, subject };
  }

  function requireKeyring(): SecretKeyring {
    if (!deps.keyring)
      throw new NotificationError(
        "SECRETS_NOT_CONFIGURED",
        "SECRET_ENCRYPTION_KEY is not configured",
      );
    return deps.keyring;
  }

  return {
    permissions(actor: NotificationActor) {
      const subject = actor.subject;
      const active = Boolean(subject && subject.status === "active");
      return {
        canRead: Boolean(active && subject && hasPermission(subject, "notification.read.self")),
        canManage: Boolean(active && subject && hasPermission(subject, "notification.manage.self")),
        vapidConfigured: Boolean(
          deps.vapid?.publicKey?.trim() &&
          deps.vapid?.privateKey?.trim() &&
          deps.vapid?.subject?.trim(),
        ),
      };
    },

    getVapidPublicKey(actor: NotificationActor): { publicKey: string | null } {
      requireSelfPermission(actor, "notification.read.self");
      const publicKey = deps.vapid?.publicKey?.trim() || null;
      const privateKey = deps.vapid?.privateKey?.trim();
      const subject = deps.vapid?.subject?.trim();
      if (!publicKey || !privateKey || !subject) return { publicKey: null };
      return { publicKey };
    },

    async list(actor: NotificationActor): Promise<{ items: PushSubscriptionView[] }> {
      requireSelfPermission(actor, "notification.read.self");
      const rows = await deps.store.listActiveForUser(actor.userId!);
      return { items: rows.map(toView) };
    },

    async subscribe(actor: NotificationActor, input: unknown): Promise<PushSubscriptionView> {
      requireSelfPermission(actor, "notification.manage.self");
      const keyring = requireKeyring();
      requireVapidConfigured();
      const parsed = parsePushSubscribeInput(input);
      return upsertSubscription(actor.userId!, parsed, keyring);
    },

    async unsubscribe(actor: NotificationActor, input: unknown): Promise<{ removed: boolean }> {
      requireSelfPermission(actor, "notification.manage.self");
      const parsed = parsePushUnsubscribeInput(input);
      if (parsed.id) {
        const removed = await deps.store.deleteForUser(parsed.id, actor.userId!);
        return { removed };
      }
      const endpointHash = hashPushEndpoint(parsed.endpoint!);
      const existing = await deps.store.findByUserAndEndpointHash(actor.userId!, endpointHash);
      if (!existing || existing.userId !== actor.userId!) return { removed: false };
      const removed = await deps.store.deleteForUser(existing.id, actor.userId!);
      return { removed };
    },

    async deliverForNotification(notification: NotificationRecord): Promise<void> {
      if (!deps.keyring) return;
      const publicKey = deps.vapid?.publicKey?.trim();
      const privateKey = deps.vapid?.privateKey?.trim();
      const subject = deps.vapid?.subject?.trim();
      if (!publicKey || !privateKey || !subject) return;

      const vapid = { publicKey, privateKey, subject };
      const rows = await deps.store.listActiveForUser(notification.userId);
      if (rows.length === 0) return;

      const payload = JSON.stringify(buildSafePushPayload(notification));
      for (const row of rows) {
        try {
          const keys = decryptKeys(deps.keyring, row);
          const result = await deps.send({
            endpoint: keys.endpoint,
            keys: { p256dh: keys.p256dh, auth: keys.auth },
            payload,
            vapid,
          });
          if (isGoneStatus(result.statusCode)) {
            await deps.store.disable(row.id, new Date());
            continue;
          }
          if (isTransientStatus(result.statusCode) && result.statusCode != null) {
            deps.logger?.warn("web_push_transient_failure", {
              statusCode: result.statusCode,
              subscriptionId: row.id,
            });
          }
        } catch (error) {
          const statusCode =
            typeof error === "object" &&
            error !== null &&
            "statusCode" in error &&
            typeof (error as { statusCode?: unknown }).statusCode === "number"
              ? (error as { statusCode: number }).statusCode
              : undefined;
          if (isGoneStatus(statusCode)) {
            await deps.store.disable(row.id, new Date());
            continue;
          }
          deps.logger?.warn("web_push_delivery_failed", {
            subscriptionId: row.id,
            statusCode: statusCode ?? null,
          });
        }
      }
    },
  };

  async function upsertSubscription(
    userId: string,
    parsed: PushSubscribeInput,
    keyring: SecretKeyring,
  ): Promise<PushSubscriptionView> {
    const endpointHash = hashPushEndpoint(parsed.endpoint);
    const existing = await deps.store.findByUserAndEndpointHash(userId, endpointHash);
    const now = new Date();
    const userAgent = parsed.userAgent?.trim() || null;

    if (existing) {
      const encrypted = encryptFields(keyring, {
        userId,
        subscriptionId: existing.id,
        endpoint: parsed.endpoint,
        p256dh: parsed.keys.p256dh,
        auth: parsed.keys.auth,
      });
      const updated = await deps.store.updateEncrypted(existing.id, {
        endpoint: encrypted.endpoint,
        p256dh: encrypted.p256dh,
        auth: encrypted.auth,
        keyVersion: encrypted.keyVersion,
        userAgent,
        disabledAt: null,
        updatedAt: now,
      });
      return toView(updated);
    }

    const activeCount = await deps.store.countActiveForUser(userId);
    if (activeCount >= PUSH_MAX_SUBSCRIPTIONS_PER_USER)
      throw new NotificationError(
        "CONFLICT",
        `Maximum of ${PUSH_MAX_SUBSCRIPTIONS_PER_USER} active push subscriptions reached`,
      );

    const id = randomUUID();
    const encrypted = encryptFields(keyring, {
      userId,
      subscriptionId: id,
      endpoint: parsed.endpoint,
      p256dh: parsed.keys.p256dh,
      auth: parsed.keys.auth,
    });
    const created = await deps.store.insert({
      id,
      userId,
      endpointHash,
      endpoint: encrypted.endpoint,
      p256dh: encrypted.p256dh,
      auth: encrypted.auth,
      keyVersion: encrypted.keyVersion,
      userAgent,
      now,
    });
    return toView(created);
  }
}
