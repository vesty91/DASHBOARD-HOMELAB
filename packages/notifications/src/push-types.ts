export const PUSH_MAX_SUBSCRIPTIONS_PER_USER = 10;
export const PUSH_ENDPOINT_MAX = 2048;
export const PUSH_KEY_MAX = 512;
export const PUSH_USER_AGENT_MAX = 512;

export type PushEncryptedField = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpointHash: string;
  endpoint: PushEncryptedField;
  p256dh: PushEncryptedField;
  auth: PushEncryptedField;
  keyVersion: number;
  userAgent: string | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PushSubscriptionView {
  id: string;
  endpointHash: string;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PushSubscriptionStorePort {
  findByUserAndEndpointHash(
    userId: string,
    endpointHash: string,
  ): Promise<PushSubscriptionRecord | null>;
  countActiveForUser(userId: string): Promise<number>;
  listActiveForUser(userId: string): Promise<PushSubscriptionRecord[]>;
  get(id: string): Promise<PushSubscriptionRecord | null>;
  insert(input: {
    id: string;
    userId: string;
    endpointHash: string;
    endpoint: PushEncryptedField;
    p256dh: PushEncryptedField;
    auth: PushEncryptedField;
    keyVersion: number;
    userAgent: string | null;
    now: Date;
  }): Promise<PushSubscriptionRecord>;
  updateEncrypted(
    id: string,
    patch: {
      endpoint: PushEncryptedField;
      p256dh: PushEncryptedField;
      auth: PushEncryptedField;
      keyVersion: number;
      userAgent: string | null;
      disabledAt: null;
      updatedAt: Date;
    },
  ): Promise<PushSubscriptionRecord>;
  disable(id: string, at: Date): Promise<void>;
  deleteForUser(id: string, userId: string): Promise<boolean>;
}
