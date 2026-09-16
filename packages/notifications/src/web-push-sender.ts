import webpush from "web-push";
import type { WebPushSender } from "./push-service";

export const createWebPushSender = (): WebPushSender => {
  return async ({ endpoint, keys, payload, vapid }) => {
    try {
      const result = await webpush.sendNotification(
        {
          endpoint,
          keys: {
            p256dh: keys.p256dh,
            auth: keys.auth,
          },
        },
        payload,
        {
          vapidDetails: {
            subject: vapid.subject,
            publicKey: vapid.publicKey,
            privateKey: vapid.privateKey,
          },
          TTL: 60,
          urgency: "normal",
        },
      );
      return { statusCode: result.statusCode, body: result.body };
    } catch (error) {
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        typeof (error as { statusCode?: unknown }).statusCode === "number"
          ? (error as { statusCode: number }).statusCode
          : undefined;
      if (statusCode != null) {
        const err = new Error("Web Push delivery failed") as Error & { statusCode: number };
        err.statusCode = statusCode;
        throw err;
      }
      throw error;
    }
  };
};
