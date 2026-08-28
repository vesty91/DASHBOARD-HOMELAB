export class SecretError extends Error {
  constructor(
    readonly code:
      "INVALID_KEY" | "UNKNOWN_KEY_VERSION" | "DECRYPT_FAILED" | "SECRETS_NOT_CONFIGURED",
    message: string,
  ) {
    super(message);
    this.name = "SecretError";
  }
}
